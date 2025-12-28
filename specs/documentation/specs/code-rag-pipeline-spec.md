# Code RAG Pipeline Technical Specification

**Version**: 1.0.0  
**Status**: Draft  
**Created**: 2024-12-16  
**Author**: Swarm Architecture Team  

---

## Executive Summary

This specification defines the Retrieval-Augmented Generation (RAG) pipeline for Swarm's autonomous coding agents. After evaluating RAPTOR, Late Chunking, and AST-based approaches, we recommend a **hybrid architecture** prioritizing AST-based code chunking (cAST) for source code with optional RAPTOR summaries for documentation.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| AST-based chunking for code | 5.5pt gain on RepoEval, preserves semantic boundaries |
| RAPTOR for documentation | 20% improvement on multi-hop reasoning |
| Late Chunking deferred | Marginal gains for code-length documents |
| pgvector for storage | Leverages existing PostgreSQL expertise |

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SWARM CODE RAG PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │   Source    │     │    AST      │     │  Embedding  │               │
│  │   Files     │────▶│   Parser    │────▶│  Generator  │               │
│  │  (.js/.py)  │     │ (tree-sitter)│    │  (voyage-3) │               │
│  └─────────────┘     └─────────────┘     └──────┬──────┘               │
│                                                  │                      │
│  ┌─────────────┐     ┌─────────────┐            │                      │
│  │    Docs     │     │   RAPTOR    │            │                      │
│  │  (README,   │────▶│  Summarizer │────────────┤                      │
│  │   specs)    │     │             │            │                      │
│  └─────────────┘     └─────────────┘            │                      │
│                                                  ▼                      │
│                                          ┌─────────────┐               │
│                                          │   Vector    │               │
│                                          │   Store     │               │
│                                          │  (pgvector) │               │
│                                          └──────┬──────┘               │
│                                                  │                      │
│  ┌─────────────┐     ┌─────────────┐            │                      │
│  │   Agent     │     │  Retrieval  │            │                      │
│  │   Query     │────▶│  + Rerank   │◀───────────┘                      │
│  │             │     │             │                                    │
│  └─────────────┘     └──────┬──────┘                                   │
│                             │                                           │
│                             ▼                                           │
│                      ┌─────────────┐                                   │
│                      │   Context   │                                   │
│                      │  Assembly   │────▶ Claude API                   │
│                      │             │                                    │
│                      └─────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 AST Parser (cAST Module)

**Purpose**: Parse source code into semantically meaningful chunks using Abstract Syntax Trees.

**Technology**: tree-sitter (multi-language parser)

**Supported Languages** (Phase 1):
- JavaScript/TypeScript
- Python
- Go
- Rust

#### 2.1.1 Chunking Strategy

```javascript
// Chunk hierarchy (from most to least granular)
const CHUNK_LEVELS = {
  FUNCTION: 1,      // Individual functions/methods
  CLASS: 2,         // Classes with method signatures
  MODULE: 3,        // Module-level exports/imports
  FILE: 4           // Full file (for small files only)
};

// Configuration
const AST_CHUNK_CONFIG = {
  max_chunk_tokens: 512,
  min_chunk_tokens: 64,
  overlap_tokens: 32,
  include_metadata: true,
  preserve_imports: true
};
```

#### 2.1.2 Chunk Structure

```typescript
interface CodeChunk {
  id: string;                    // UUID
  content: string;               // Raw code content
  tokens: number;                // Token count
  
  // Metadata
  metadata: {
    filepath: string;            // e.g., "src/api/tickets.js"
    language: string;            // e.g., "javascript"
    chunk_type: ChunkType;       // function | class | module | file
    
    // Structural context
    parent_class?: string;       // If method, parent class name
    function_name?: string;      // Function/method name
    imports: string[];           // Import statements in scope
    exports: string[];           // What this chunk exports
    
    // Position
    start_line: number;
    end_line: number;
    start_byte: number;
    end_byte: number;
  };
  
  // Embedding
  embedding?: number[];          // 1024-dim vector (voyage-code-3)
  
  // Relationships
  references: string[];          // Other chunks this references
  referenced_by: string[];       // Chunks that reference this
}
```

#### 2.1.3 tree-sitter Integration

```javascript
// src/rag/ast-parser.js
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');
const Python = require('tree-sitter-python');

class ASTChunker {
  constructor(config = AST_CHUNK_CONFIG) {
    this.config = config;
    this.parser = new Parser();
    this.languages = {
      javascript: JavaScript,
      typescript: JavaScript,  // tree-sitter-typescript if needed
      python: Python
    };
  }

  
  setLanguage(lang) {
    if (!this.languages[lang]) {
      throw new Error(`Unsupported language: ${lang}`);
    }
    this.parser.setLanguage(this.languages[lang]);
  }
  
  async chunkFile(filepath, content) {
    const lang = this.detectLanguage(filepath);
    this.setLanguage(lang);
    
    const tree = this.parser.parse(content);
    const chunks = [];
    
    // Walk AST and extract semantic units
    this.walkTree(tree.rootNode, chunks, {
      filepath,
      language: lang,
      imports: this.extractImports(tree.rootNode, lang)
    });
    
    return this.postProcess(chunks);
  }
  
  walkTree(node, chunks, context) {
    // Handle different node types
    switch (node.type) {
      case 'function_declaration':
      case 'arrow_function':
      case 'method_definition':
        chunks.push(this.createFunctionChunk(node, context));
        break;
        
      case 'class_declaration':
      case 'class_definition':
        chunks.push(this.createClassChunk(node, context));
        break;
        
      default:
        // Recurse into children
        for (const child of node.children) {
          this.walkTree(child, chunks, context);
        }
    }
  }
  
  createFunctionChunk(node, context) {
    const content = node.text;
    const name = this.extractFunctionName(node);
    
    // Include parent class context if method
    const parentClass = this.findParentClass(node);
    
    // Build metadata header
    const metadataHeader = this.buildMetadataHeader({
      type: 'function',
      name,
      filepath: context.filepath,
      parentClass
    });
    
    return {
      id: generateUUID(),
      content: metadataHeader + '\n' + content,
      tokens: this.countTokens(content),
      metadata: {
        filepath: context.filepath,
        language: context.language,
        chunk_type: 'function',
        function_name: name,
        parent_class: parentClass,
        imports: context.imports,
        start_line: node.startPosition.row + 1,
        end_line: node.endPosition.row + 1
      }
    };
  }
  
  buildMetadataHeader({ type, name, filepath, parentClass }) {
    // Metadata header improves retrieval by providing context
    let header = `// File: ${filepath}\n`;
    if (parentClass) {
      header += `// Class: ${parentClass}\n`;
    }
    header += `// ${type}: ${name}\n`;
    return header;
  }
}

module.exports = { ASTChunker, AST_CHUNK_CONFIG };
```

---

### 2.2 RAPTOR Summarizer (Documentation Module)

**Purpose**: Build hierarchical summary trees for documentation and specifications.

**When to Use**:
- README files
- API documentation
- Design specifications
- Historical ticket descriptions

**When NOT to Use**:
- Source code files (use AST chunking)
- Config files (parse directly)
- Small files < 500 tokens

#### 2.2.1 RAPTOR Tree Structure

```
                    [L3: Project Summary]
                    "Swarm is a distributed AI agent
                     coordination system using Firecracker
                     microVMs for parallel code generation"
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       [L2: Infra]     [L2: Agents]    [L2: API]
       "VM orchest-    "Worker, Re-    "HTTP ticket
        ration with     view, Design    claiming with
        snapshots"      agents..."      JWT auth"
              │               │               │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
        ▼     ▼     ▼   ▼     ▼     ▼   ▼     ▼     ▼
      [L1 chunks]     [L1 chunks]     [L1 chunks]
      Raw text        Raw text        Raw text
      ~512 tokens     ~512 tokens     ~512 tokens
```

#### 2.2.2 RAPTOR Implementation

```javascript
// src/rag/raptor-summarizer.js
const { Anthropic } = require('@anthropic-ai/sdk');

class RAPTORSummarizer {
  constructor(config) {
    this.config = {
      chunk_size: 512,           // Base chunk size in tokens
      cluster_size: 5,           // Chunks per cluster
      max_levels: 3,             // Tree depth
      summary_model: 'claude-3-haiku-20240307',
      embedding_model: 'voyage-3'
    };
    this.anthropic = new Anthropic();
  }

  
  async buildTree(documentChunks) {
    const levels = [documentChunks]; // Level 0 = base chunks
    
    let currentLevel = documentChunks;
    let levelIndex = 0;
    
    while (currentLevel.length > 1 && levelIndex < this.config.max_levels) {
      // Cluster chunks by semantic similarity
      const clusters = await this.clusterChunks(currentLevel);
      
      // Summarize each cluster
      const summaries = await Promise.all(
        clusters.map(cluster => this.summarizeCluster(cluster))
      );
      
      levels.push(summaries);
      currentLevel = summaries;
      levelIndex++;
    }
    
    return {
      levels,
      root: levels[levels.length - 1][0],
      metadata: {
        depth: levels.length,
        total_chunks: this.countAllChunks(levels)
      }
    };
  }
  
  async clusterChunks(chunks) {
    // Get embeddings for all chunks
    const embeddings = await this.getEmbeddings(
      chunks.map(c => c.content)
    );
    
    // GMM clustering (Gaussian Mixture Model)
    // As per RAPTOR paper, GMM allows soft clustering
    const clusters = this.gmmCluster(embeddings, {
      n_clusters: Math.ceil(chunks.length / this.config.cluster_size),
      threshold: 0.5  // Soft assignment threshold
    });
    
    // Map cluster indices back to chunks
    return clusters.map(indices => 
      indices.map(i => chunks[i])
    );
  }
  
  async summarizeCluster(chunks) {
    const combinedText = chunks
      .map(c => c.content)
      .join('\n\n---\n\n');
    
    const response = await this.anthropic.messages.create({
      model: this.config.summary_model,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize the following related content in 2-3 sentences, 
                  preserving key technical details and relationships:
                  
                  ${combinedText}`
      }]
    });
    
    return {
      content: response.content[0].text,
      children: chunks.map(c => c.id),
      level: chunks[0].level + 1,
      id: generateUUID()
    };
  }
}

module.exports = { RAPTORSummarizer };
```

---

### 2.3 Vector Store (pgvector)

**Purpose**: Store and retrieve code/document embeddings efficiently.

**Technology**: PostgreSQL with pgvector extension

#### 2.3.1 Schema Design

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main chunks table
CREATE TABLE code_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content
  content TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  
  -- Embedding (1024 dimensions for voyage-code-3)
  embedding vector(1024),
  
  -- Source tracking
  repo_id UUID REFERENCES repositories(id),
  filepath TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  commit_sha TEXT,
  
  -- Chunk metadata
  chunk_type TEXT CHECK (chunk_type IN (
    'function', 'class', 'module', 'file', 
    'documentation', 'raptor_summary'
  )),
  language TEXT,
  
  -- Structural metadata (JSONB for flexibility)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_at TIMESTAMPTZ
);

-- RAPTOR tree nodes
CREATE TABLE raptor_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content
  summary TEXT NOT NULL,
  embedding vector(1024),
  
  -- Tree structure
  parent_id UUID REFERENCES raptor_nodes(id),
  level INTEGER NOT NULL CHECK (level >= 0),
  children UUID[] DEFAULT '{}',
  
  -- Source
  doc_id UUID REFERENCES documents(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX idx_chunks_embedding ON code_chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_chunks_repo ON code_chunks(repo_id);
CREATE INDEX idx_chunks_filepath ON code_chunks(filepath);
CREATE INDEX idx_chunks_type ON code_chunks(chunk_type);

CREATE INDEX idx_raptor_embedding ON raptor_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX idx_raptor_level ON raptor_nodes(level);
CREATE INDEX idx_raptor_doc ON raptor_nodes(doc_id);
```

#### 2.3.2 Vector Store Service

```javascript
// src/rag/vector-store.js
const { Pool } = require('pg');

class VectorStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }
  
  async upsertChunk(chunk) {
    const query = `
      INSERT INTO code_chunks (
        id, content, tokens, embedding, repo_id, 
        filepath, branch, chunk_type, language, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        tokens = EXCLUDED.tokens,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
      RETURNING id
    `;
    
    const values = [
      chunk.id,
      chunk.content,
      chunk.tokens,
      `[${chunk.embedding.join(',')}]`,
      chunk.repo_id,
      chunk.metadata.filepath,
      chunk.metadata.branch || 'main',
      chunk.metadata.chunk_type,
      chunk.metadata.language,
      JSON.stringify(chunk.metadata)
    ];
    
    return this.pool.query(query, values);
  }

  
  async searchSimilar(embedding, options = {}) {
    const {
      limit = 10,
      threshold = 0.7,
      repo_id = null,
      chunk_types = null,
      include_raptor = true
    } = options;
    
    // Search code chunks
    let codeQuery = `
      SELECT 
        id, content, tokens, chunk_type, metadata,
        1 - (embedding <=> $1) as similarity
      FROM code_chunks
      WHERE 1 - (embedding <=> $1) > $2
    `;
    
    const params = [`[${embedding.join(',')}]`, threshold];
    let paramIndex = 3;
    
    if (repo_id) {
      codeQuery += ` AND repo_id = $${paramIndex}`;
      params.push(repo_id);
      paramIndex++;
    }
    
    if (chunk_types && chunk_types.length > 0) {
      codeQuery += ` AND chunk_type = ANY($${paramIndex})`;
      params.push(chunk_types);
      paramIndex++;
    }
    
    codeQuery += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const results = await this.pool.query(codeQuery, params);
    
    // Optionally include RAPTOR summaries
    if (include_raptor) {
      const raptorQuery = `
        SELECT 
          id, summary as content, level, 
          1 - (embedding <=> $1) as similarity,
          'raptor_summary' as chunk_type
        FROM raptor_nodes
        WHERE 1 - (embedding <=> $1) > $2
        ORDER BY similarity DESC, level DESC
        LIMIT $3
      `;
      
      const raptorResults = await this.pool.query(raptorQuery, [
        `[${embedding.join(',')}]`,
        threshold,
        Math.ceil(limit / 3) // Fewer summaries than code chunks
      ]);
      
      // Merge and re-sort
      return [...results.rows, ...raptorResults.rows]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }
    
    return results.rows;
  }
  
  async deleteByRepo(repo_id) {
    await this.pool.query(
      'DELETE FROM code_chunks WHERE repo_id = $1',
      [repo_id]
    );
  }
  
  async getChunksByFile(filepath) {
    return this.pool.query(
      'SELECT * FROM code_chunks WHERE filepath = $1 ORDER BY metadata->>\'start_line\'',
      [filepath]
    );
  }
}

module.exports = { VectorStore };
```

---

### 2.4 Embedding Service

**Purpose**: Generate vector embeddings for code and text.

**Model Selection**:
- **Code**: `voyage-code-3` (1024 dim, optimized for code)
- **Text**: `voyage-3` (1024 dim, general purpose)

#### 2.4.1 Embedding Service Implementation

```javascript
// src/rag/embedding-service.js
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

class EmbeddingService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.models = {
      code: 'voyage-code-3',
      text: 'voyage-3'
    };
  }
  
  async embed(texts, type = 'code') {
    const model = this.models[type] || this.models.code;
    
    // Batch requests (max 128 texts per request)
    const batches = this.batchArray(texts, 128);
    const embeddings = [];
    
    for (const batch of batches) {
      const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          input: batch,
          input_type: type === 'code' ? 'document' : 'document'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }
      
      const data = await response.json();
      embeddings.push(...data.data.map(d => d.embedding));
    }
    
    return embeddings;
  }
  
  async embedQuery(query) {
    // Queries use different input_type for voyage
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.models.code,
        input: [query],
        input_type: 'query'
      })
    });
    
    const data = await response.json();
    return data.data[0].embedding;
  }
  
  batchArray(arr, size) {
    const batches = [];
    for (let i = 0; i < arr.length; i += size) {
      batches.push(arr.slice(i, i + size));
    }
    return batches;
  }
}

module.exports = { EmbeddingService };
```

---

## 3. Retrieval Pipeline

### 3.1 Query Understanding

Before retrieval, classify the query to optimize search strategy:

```javascript
// src/rag/query-classifier.js
const QUERY_TYPES = {
  CODE_IMPLEMENTATION: 'code_impl',      // "How to implement X"
  CODE_EXAMPLE: 'code_example',          // "Show me examples of X"
  ARCHITECTURE: 'architecture',           // "How does X work"
  BUG_FIX: 'bug_fix',                    // "Fix this error"
  REFACTOR: 'refactor'                   // "Improve this code"
};

class QueryClassifier {
  constructor(anthropic) {
    this.anthropic = anthropic;
  }
  
  async classify(query) {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Classify this coding query into one category:
        - code_impl: Implementation questions
        - code_example: Requests for examples
        - architecture: System design questions  
        - bug_fix: Error fixing
        - refactor: Code improvement
        
        Query: "${query}"
        
        Respond with just the category name.`
      }]
    });
    
    return response.content[0].text.trim();
  }
}
```


### 3.2 Hybrid Retrieval Strategy

```javascript
// src/rag/retriever.js
class HybridRetriever {
  constructor(vectorStore, embeddingService, raptorStore) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.raptorStore = raptorStore;
  }
  
  async retrieve(query, options = {}) {
    const {
      repo_id,
      top_k = 10,
      include_summaries = true,
      query_type = null
    } = options;
    
    // 1. Embed the query
    const queryEmbedding = await this.embeddingService.embedQuery(query);
    
    // 2. Parallel retrieval from multiple sources
    const [codeResults, raptorResults] = await Promise.all([
      // Code chunks (AST-based)
      this.vectorStore.searchSimilar(queryEmbedding, {
        limit: top_k,
        repo_id,
        chunk_types: ['function', 'class', 'module'],
        threshold: 0.65
      }),
      
      // RAPTOR summaries (if enabled)
      include_summaries ? this.raptorStore.searchTree(queryEmbedding, {
        limit: Math.ceil(top_k / 3),
        traverse: 'bottom_up'  // Start from leaves, include parents
      }) : []
    ]);
    
    // 3. Merge and deduplicate
    const merged = this.mergeResults(codeResults, raptorResults);
    
    // 4. Rerank using cross-encoder or LLM
    const reranked = await this.rerank(query, merged, top_k);
    
    return reranked;
  }
  
  mergeResults(codeResults, raptorResults) {
    const seen = new Set();
    const merged = [];
    
    // Interleave results, prioritizing code
    for (let i = 0; i < Math.max(codeResults.length, raptorResults.length); i++) {
      if (i < codeResults.length) {
        const chunk = codeResults[i];
        if (!seen.has(chunk.id)) {
          seen.add(chunk.id);
          merged.push({ ...chunk, source: 'code' });
        }
      }
      
      if (i < raptorResults.length) {
        const summary = raptorResults[i];
        if (!seen.has(summary.id)) {
          seen.add(summary.id);
          merged.push({ ...summary, source: 'raptor' });
        }
      }
    }
    
    return merged;
  }
  
  async rerank(query, results, top_k) {
    // Use Cohere rerank or LLM-based scoring
    // For now, simple similarity-based ranking
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, top_k);
  }
}

module.exports = { HybridRetriever };
```

---

### 3.3 Context Assembly

```javascript
// src/rag/context-assembler.js
class ContextAssembler {
  constructor(config = {}) {
    this.config = {
      max_tokens: 8000,        // Leave room for response
      code_priority: 0.7,      // 70% budget for code
      summary_priority: 0.3,   // 30% budget for summaries
      ...config
    };
  }
  
  assemble(retrievedChunks, query_type) {
    const budget = this.config.max_tokens;
    const codeBudget = Math.floor(budget * this.config.code_priority);
    const summaryBudget = budget - codeBudget;
    
    // Separate by source
    const codeChunks = retrievedChunks.filter(c => c.source === 'code');
    const summaries = retrievedChunks.filter(c => c.source === 'raptor');
    
    // Build context sections
    const sections = [];
    
    // 1. Architectural context (from RAPTOR summaries)
    if (summaries.length > 0) {
      sections.push({
        header: '## Architectural Context',
        content: this.formatSummaries(summaries, summaryBudget)
      });
    }
    
    // 2. Relevant code examples
    if (codeChunks.length > 0) {
      sections.push({
        header: '## Relevant Code',
        content: this.formatCode(codeChunks, codeBudget)
      });
    }
    
    // 3. Build final context string
    return sections
      .map(s => `${s.header}\n\n${s.content}`)
      .join('\n\n---\n\n');
  }
  
  formatCode(chunks, budget) {
    let tokens = 0;
    const formatted = [];
    
    for (const chunk of chunks) {
      if (tokens + chunk.tokens > budget) break;
      
      formatted.push(
        `### ${chunk.metadata.filepath}` +
        (chunk.metadata.function_name ? ` - ${chunk.metadata.function_name}` : '') +
        `\n\`\`\`${chunk.metadata.language}\n${chunk.content}\n\`\`\``
      );
      
      tokens += chunk.tokens;
    }
    
    return formatted.join('\n\n');
  }
  
  formatSummaries(summaries, budget) {
    // Higher-level summaries first
    const sorted = summaries.sort((a, b) => (b.level || 0) - (a.level || 0));
    
    let tokens = 0;
    const formatted = [];
    
    for (const summary of sorted) {
      const summaryTokens = this.countTokens(summary.content);
      if (tokens + summaryTokens > budget) break;
      
      formatted.push(`- ${summary.content}`);
      tokens += summaryTokens;
    }
    
    return formatted.join('\n');
  }
  
  countTokens(text) {
    // Approximate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

module.exports = { ContextAssembler };
```

---

## 4. Indexing Pipeline

### 4.1 Repository Indexer

```javascript
// src/rag/indexer.js
const { ASTChunker } = require('./ast-parser');
const { RAPTORSummarizer } = require('./raptor-summarizer');
const { EmbeddingService } = require('./embedding-service');
const { VectorStore } = require('./vector-store');
const glob = require('glob');
const fs = require('fs').promises;

class RepositoryIndexer {
  constructor(config) {
    this.chunker = new ASTChunker();
    this.raptor = new RAPTORSummarizer();
    this.embeddings = new EmbeddingService(config.voyageApiKey);
    this.vectorStore = new VectorStore(config.postgresUrl);
    
    this.config = {
      codeExtensions: ['.js', '.ts', '.py', '.go', '.rs'],
      docExtensions: ['.md', '.txt', '.rst'],
      ignorePaths: ['node_modules', 'dist', 'build', '.git', 'vendor'],
      ...config
    };
  }
  
  async indexRepository(repoPath, repoId) {
    console.log(`Indexing repository: ${repoPath}`);
    
    // 1. Find all relevant files
    const codeFiles = await this.findFiles(repoPath, this.config.codeExtensions);
    const docFiles = await this.findFiles(repoPath, this.config.docExtensions);
    
    console.log(`Found ${codeFiles.length} code files, ${docFiles.length} doc files`);
    
    // 2. Index code files with AST chunking
    const codeChunks = [];
    for (const file of codeFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const chunks = await this.chunker.chunkFile(file, content);
      chunks.forEach(c => c.repo_id = repoId);
      codeChunks.push(...chunks);
    }
    
    // 3. Generate embeddings for code chunks
    console.log(`Generating embeddings for ${codeChunks.length} code chunks`);
    const codeEmbeddings = await this.embeddings.embed(
      codeChunks.map(c => c.content),
      'code'
    );
    
    codeChunks.forEach((chunk, i) => {
      chunk.embedding = codeEmbeddings[i];
    });
    
    // 4. Store code chunks
    for (const chunk of codeChunks) {
      await this.vectorStore.upsertChunk(chunk);
    }
    
    // 5. Index documentation with RAPTOR
    for (const file of docFiles) {
      const content = await fs.readFile(file, 'utf-8');
      await this.indexDocument(file, content, repoId);
    }
    
    console.log(`Indexing complete for ${repoPath}`);
    
    return {
      code_chunks: codeChunks.length,
      doc_files: docFiles.length
    };
  }
  
  async indexDocument(filepath, content, repoId) {
    // Split into base chunks
    const baseChunks = this.splitText(content, 512);
    
    // Build RAPTOR tree
    const tree = await this.raptor.buildTree(baseChunks);
    
    // Generate embeddings for all nodes
    const allNodes = tree.levels.flat();
    const embeddings = await this.embeddings.embed(
      allNodes.map(n => n.content || n.summary),
      'text'
    );
    
    // Store in vector DB
    for (let i = 0; i < allNodes.length; i++) {
      allNodes[i].embedding = embeddings[i];
      allNodes[i].repo_id = repoId;
      allNodes[i].filepath = filepath;
      await this.vectorStore.upsertRaptorNode(allNodes[i]);
    }
  }
  
  async findFiles(basePath, extensions) {
    const pattern = `${basePath}/**/*{${extensions.join(',')}}`;
    const files = await glob(pattern, {
      ignore: this.config.ignorePaths.map(p => `**/${p}/**`)
    });
    return files;
  }
  
  splitText(text, maxTokens) {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let current = '';
    
    for (const sentence of sentences) {
      if (this.countTokens(current + sentence) > maxTokens) {
        if (current) chunks.push({ content: current.trim(), level: 0 });
        current = sentence;
      } else {
        current += ' ' + sentence;
      }
    }
    
    if (current.trim()) {
      chunks.push({ content: current.trim(), level: 0 });
    }
    
    return chunks;
  }
  
  countTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

module.exports = { RepositoryIndexer };
```

---

## 5. Integration with Swarm Agents

### 5.1 Worker Agent RAG Integration

```javascript
// In swarm-agent-v2/src/agent.js - RAG enhancement

class SwarmWorkerAgent {
  constructor(config) {
    // ... existing config ...
    this.rag = new HybridRetriever(
      config.vectorStore,
      config.embeddingService,
      config.raptorStore
    );
    this.contextAssembler = new ContextAssembler();
  }
  
  async executeTicket(ticket) {
    // 1. Build RAG query from ticket
    const ragQuery = this.buildRAGQuery(ticket);
    
    // 2. Retrieve relevant context
    const retrievedChunks = await this.rag.retrieve(ragQuery, {
      repo_id: ticket.repo_id,
      top_k: 15,
      include_summaries: true
    });
    
    // 3. Assemble context
    const ragContext = this.contextAssembler.assemble(
      retrievedChunks,
      ticket.type
    );
    
    // 4. Build enhanced prompt
    const prompt = this.buildPrompt(ticket, ragContext);
    
    // 5. Generate code with Claude
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return this.processResponse(response);
  }
  
  buildRAGQuery(ticket) {
    // Combine ticket title, description, and acceptance criteria
    return `${ticket.title}\n\n${ticket.description}\n\n` +
           `Requirements:\n${ticket.acceptance_criteria.join('\n')}`;
  }
  
  buildPrompt(ticket, ragContext) {
    return `You are implementing a feature for the Swarm codebase.

## Task
${ticket.title}

## Description
${ticket.description}

## Acceptance Criteria
${ticket.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Codebase Context
The following code and documentation from the repository is relevant:

${ragContext}

## Instructions
1. Implement the feature following existing patterns shown above
2. Match the code style and conventions
3. Include appropriate error handling
4. Add comments for complex logic

Provide the complete implementation.`;
  }
}
```

---

## 6. Performance Benchmarks

### 6.1 Expected Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Indexing throughput | 1000 files/min | Time 10K file repo |
| Query latency (p50) | < 200ms | End-to-end retrieval |
| Query latency (p99) | < 500ms | End-to-end retrieval |
| Retrieval precision | > 0.75 | Manual evaluation on 100 queries |
| Context relevance | > 0.80 | LLM-as-judge scoring |

### 6.2 Scaling Considerations

```
Files/Repo    Chunks      pgvector Index    RAM Required
─────────────────────────────────────────────────────────
100           500         ~50 MB            1 GB
1,000         5,000       ~500 MB           2 GB
10,000        50,000      ~5 GB             8 GB
100,000       500,000     ~50 GB            32 GB
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up pgvector database schema
- [ ] Implement ASTChunker with tree-sitter
- [ ] Implement EmbeddingService with Voyage API
- [ ] Basic vector search functionality

### Phase 2: Core Pipeline (Week 3-4)
- [ ] Build RepositoryIndexer
- [ ] Implement HybridRetriever
- [ ] Create ContextAssembler
- [ ] Integration tests

### Phase 3: RAPTOR Integration (Week 5-6)
- [ ] Implement RAPTORSummarizer
- [ ] Add documentation indexing
- [ ] Tree traversal for retrieval
- [ ] Performance optimization

### Phase 4: Agent Integration (Week 7-8)
- [ ] Integrate RAG into Worker Agent
- [ ] Add RAG to Design Agent
- [ ] Evaluation and tuning
- [ ] Production deployment

---

## 8. Configuration Reference

```yaml
# config/rag.yaml
rag:
  # AST Chunking
  ast:
    max_chunk_tokens: 512
    min_chunk_tokens: 64
    overlap_tokens: 32
    supported_languages:
      - javascript
      - typescript
      - python
      - go

  # RAPTOR
  raptor:
    enabled: true
    chunk_size: 512
    cluster_size: 5
    max_levels: 3
    summary_model: claude-3-haiku-20240307

  # Embeddings
  embeddings:
    provider: voyage
    code_model: voyage-code-3
    text_model: voyage-3
    dimensions: 1024
    batch_size: 128

  # Vector Store
  vector_store:
    provider: pgvector
    index_type: ivfflat
    lists: 100
    probes: 10

  # Retrieval
  retrieval:
    default_top_k: 10
    similarity_threshold: 0.65
    include_raptor: true
    max_context_tokens: 8000
    code_priority: 0.7
```

---

## 9. API Reference

### 9.1 Index Endpoint

```
POST /api/rag/index
Content-Type: application/json
Authorization: Bearer <token>

{
  "repo_url": "https://github.com/org/repo",
  "branch": "main",
  "incremental": true
}

Response:
{
  "job_id": "uuid",
  "status": "queued",
  "estimated_time": "5m"
}
```

### 9.2 Search Endpoint

```
POST /api/rag/search
Content-Type: application/json
Authorization: Bearer <token>

{
  "query": "How to implement rate limiting middleware",
  "repo_id": "uuid",
  "top_k": 10,
  "include_summaries": true
}

Response:
{
  "results": [
    {
      "id": "uuid",
      "content": "...",
      "similarity": 0.89,
      "metadata": {
        "filepath": "src/middleware/rate-limit.js",
        "chunk_type": "function",
        "function_name": "createRateLimiter"
      }
    }
  ],
  "query_time_ms": 145
}
```

---

## 10. References

1. RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval (ICLR 2024)
   - https://arxiv.org/abs/2401.18059

2. Late Chunking: Contextual Chunk Embeddings (Jina AI, 2024)
   - https://arxiv.org/abs/2409.04701

3. cAST: AST-Based Code Chunking for Retrieval (2024)
   - https://arxiv.org/abs/2506.15655

4. Voyage AI Code Embeddings
   - https://docs.voyageai.com/docs/embeddings

5. pgvector Documentation
   - https://github.com/pgvector/pgvector

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-12-16 | Swarm Team | Initial specification |
