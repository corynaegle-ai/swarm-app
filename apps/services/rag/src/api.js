// src/api.js - Express API for RAG Pipeline
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const config = require('../config');
const { RepositoryIndexer } = require('./indexer');
const { VectorStore } = require('./vector-store');
const { EmbeddingService } = require('./embeddings');

const app = express();
app.use(cors());
app.use(express.json());

const vectorStore = new VectorStore();
const embeddings = new EmbeddingService();
const indexer = new RepositoryIndexer();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'swarm-rag', timestamp: new Date().toISOString() });
});

// List repositories
app.get('/api/rag/repositories', async (req, res) => {
  try {
    const repos = await vectorStore.listRepositories();
    res.json({ repositories: repos });
  } catch (error) {
    console.error('Error listing repositories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Register a repository
app.post('/api/rag/repositories', async (req, res) => {
  try {
    const { url, branch = 'main' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    // Check if already exists
    let repo = await vectorStore.getRepositoryByUrl(url);
    if (repo) {
      return res.json({ repository: repo, message: 'Repository already registered' });
    }

    // Register new repository
    const { v4: uuidv4 } = require('uuid');
    repo = await vectorStore.upsertRepository({
      id: uuidv4(),
      url,
      name: url.match(/\/([^\/]+?)(?:\.git)?$/)?.[1] || 'unknown',
      branch
    });

    res.status(201).json({ repository: repo });
  } catch (error) {
    console.error('Error registering repository:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get repository status
app.get('/api/rag/repositories/:id', async (req, res) => {
  try {
    const repo = await vectorStore.getRepository(req.params.id);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    res.json({ repository: repo });
  } catch (error) {
    console.error('Error getting repository:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger indexing
app.post('/api/rag/repositories/:id/index', async (req, res) => {
  try {
    const repo = await vectorStore.getRepository(req.params.id);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const { forceReindex = true } = req.body;

    // Start indexing asynchronously
    res.json({ 
      message: 'Indexing started',
      repo_id: repo.id,
      status: 'indexing'
    });

    // Run indexing in background
    indexer.indexRepository(repo.url, { 
      branch: repo.default_branch,
      forceReindex 
    }).catch(err => {
      console.error('Background indexing failed:', err);
    });

  } catch (error) {
    console.error('Error starting index:', error);
    res.status(500).json({ error: error.message });
  }
});

// Index a repository directly (register + index in one call)
app.post('/api/rag/index', async (req, res) => {
  try {
    const { url, branch = 'main', forceReindex = true } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    // Start indexing
    res.json({ 
      message: 'Indexing started',
      url,
      status: 'indexing'
    });

    // Run in background
    indexer.indexRepository(url, { branch, forceReindex })
      .then(result => console.log('Indexing complete:', result))
      .catch(err => console.error('Indexing failed:', err));

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});


// Semantic search
app.post('/api/rag/search', async (req, res) => {
  try {
    const { 
      query, 
      repo_id, 
      top_k = 10,
      chunk_types = null,
      threshold = 0.5
    } = req.body;

    // Generate query embedding
    const queryEmbedding = await embeddings.embedSingle(query);

    // Search vector store
    const results = await vectorStore.searchSimilar(queryEmbedding, {
      limit: top_k,
      repo_id,
      chunk_types,
      threshold
    });

    res.json({
      query,
      results,
      count: results.length
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Build context for a feature request
app.post('/api/rag/context', async (req, res) => {
  try {
    const {
      query,
      repo_id,
      max_tokens = 8000,
      include_file_list = true
    } = req.body;

    if (!query || !repo_id) {
      return res.status(400).json({ error: 'Query and repo_id are required' });
    }

    // Search for relevant chunks
    const queryEmbedding = await embeddings.embedSingle(query);
    const results = await vectorStore.searchSimilar(queryEmbedding, {
      limit: 20,
      repo_id,
      threshold: 0.2
    });

    console.log('[Context] Got', results.length, 'results for query:', query);

    // Build context
    let context = '';
    let tokenCount = 0;
    const filesIncluded = new Set();

    // Header
    context += `## Relevant Code Context\n\n`;
    context += `Query: "${query}"\n\n`;

    // Add chunks until we hit token limit
    for (const chunk of results) {
      let content = chunk.content;
      const remainingTokens = max_tokens - tokenCount - 50;
      
      // Truncate large chunks to fit
      if (content.length / 4 > remainingTokens && remainingTokens > 200) {
        const maxChars = remainingTokens * 4;
        content = content.substring(0, maxChars) + '\n... [truncated]';
      }
      
      const chunkText = `### ${chunk.filepath} (${chunk.chunk_type})\n\`\`\`${chunk.language}\n${content}\n\`\`\`\n\n`;
      const chunkTokens = Math.ceil(chunkText.length / 4);

      // Skip if still too large (remaining budget too small)
      if (tokenCount + chunkTokens > max_tokens && filesIncluded.size > 0) {
        break;
      }

      context += chunkText;
      tokenCount += chunkTokens;
      filesIncluded.add(chunk.filepath);
    }
    // Add file summary
    if (include_file_list) {
      context += `\n## Files to Consider\n`;
      for (const file of filesIncluded) {
        context += `- ${file}\n`;
      }
    }

    res.json({
      context,
      token_count: tokenCount,
      files: Array.from(filesIncluded),
      chunks_used: results.slice(0, filesIncluded.size).length
    });

  } catch (error) {
    console.error('Context build error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export for use in index.js
// Delete a repository and all its chunks
app.delete('/api/rag/repositories/:id', async (req, res) => {
  try {
    const repo = await vectorStore.getRepository(req.params.id);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Delete all chunks first
    await vectorStore.deleteByRepo(req.params.id);
    
    // Delete repository record
    await vectorStore.deleteRepository(req.params.id);

    res.json({ 
      message: 'Repository deleted',
      id: req.params.id,
      name: repo.name
    });
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ error: error.message });
  }
});

// GitHub Webhook - Auto-reindex on push
app.post('/api/rag/webhook/github', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const payload = JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');
      
      if (signature !== digest) {
        console.warn('[Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Only process push events
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      return res.json({ message: `Ignoring ${event} event` });
    }

    const { repository, ref } = req.body;
    const repoUrl = repository?.clone_url || repository?.html_url;
    const branch = ref?.replace('refs/heads/', '') || 'main';

    if (!repoUrl) {
      return res.status(400).json({ error: 'No repository URL in payload' });
    }

    console.log(`[Webhook] Push to ${repoUrl} branch ${branch}`);

    // Find matching repository
    const repo = await vectorStore.getRepositoryByUrl(repoUrl);
    
    if (!repo) {
      console.log(`[Webhook] Repository not registered: ${repoUrl}`);
      return res.json({ message: 'Repository not registered for indexing' });
    }

    // Only reindex if push is to the tracked branch
    if (branch !== repo.default_branch) {
      return res.json({ message: `Ignoring push to ${branch}, tracking ${repo.default_branch}` });
    }

    // Trigger reindex asynchronously
    res.json({ 
      message: 'Reindex triggered',
      repo_id: repo.id,
      repo_name: repo.name
    });

    // Run indexing in background
    indexer.indexRepository(repoUrl, { 
      branch: repo.default_branch,
      forceReindex: true 
    }).then(result => {
      console.log(`[Webhook] Reindex complete for ${repo.name}:`, result);
    }).catch(err => {
      console.error(`[Webhook] Reindex failed for ${repo.name}:`, err);
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { app };
