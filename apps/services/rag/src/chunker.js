// src/chunker.js - Fixed code chunking with proper size enforcement
const config = require('../config');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class NaiveChunker {
  constructor() {
    this.maxTokens = config.chunking.maxTokens || 512;
    this.minTokens = config.chunking.minTokens || 50;
    this.overlapTokens = config.chunking.overlapTokens || 50; // Context overlap
  }

  detectLanguage(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const langMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.md': 'markdown',
      '.txt': 'text'
    };
    return langMap[ext] || 'unknown';
  }

  countTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  chunkFile(filepath, content, repoId) {
    const language = this.detectLanguage(filepath);
    const chunks = [];

    if (['javascript', 'typescript'].includes(language)) {
      chunks.push(...this.chunkJavaScript(filepath, content, language, repoId));
    } else if (language === 'python') {
      chunks.push(...this.chunkPython(filepath, content, repoId));
    } else {
      chunks.push(...this.chunkByLines(filepath, content, language, repoId));
    }

    // CRITICAL: Enforce max size on ALL chunks
    return this.enforceMaxSize(chunks, filepath, language, repoId);
  }

  // Force-split any oversized chunks
  enforceMaxSize(chunks, filepath, language, repoId) {
    const result = [];
    
    for (const chunk of chunks) {
      if (chunk.tokens <= this.maxTokens) {
        result.push(chunk);
      } else {
        // Split oversized chunk into smaller pieces with overlap
        const subChunks = this.splitLargeChunk(chunk, filepath, language, repoId);
        result.push(...subChunks);
      }
    }
    
    return result;
  }

  splitLargeChunk(chunk, filepath, language, repoId) {
    const subChunks = [];
    const lines = chunk.content.split('\n');
    const baseName = chunk.metadata.name;
    
    let currentLines = [];
    let currentTokens = 0;
    let partNum = 1;
    let startLine = chunk.metadata.start_line;
    let overlapLines = []; // Lines to carry over for context

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.countTokens(line + '\n');
      
      // Check if adding this line exceeds max
      if (currentTokens + lineTokens > this.maxTokens && currentLines.length > 0) {
        // Create chunk from current accumulation
        const header = `// File: ${filepath}\n// ${chunk.chunk_type}: ${baseName} [part ${partNum}]\n`;
        const content = header + currentLines.join('\n');
        
        subChunks.push({
          id: uuidv4(),
          content: content,
          tokens: this.countTokens(content),
          repo_id: repoId,
          filepath: filepath,
          chunk_type: chunk.chunk_type,
          language: language,
          metadata: {
            name: `${baseName}_part${partNum}`,
            start_line: startLine,
            end_line: startLine + currentLines.length - 1,
            parent_name: baseName,
            part_number: partNum,
            imports: chunk.metadata.imports || ''
          }
        });

        // Keep last few lines as overlap for context
        const overlapCount = Math.min(5, currentLines.length);
        overlapLines = currentLines.slice(-overlapCount);
        
        // Reset for next chunk
        currentLines = [...overlapLines];
        currentTokens = this.countTokens(overlapLines.join('\n'));
        startLine = startLine + currentLines.length - overlapCount;
        partNum++;
      }
      
      currentLines.push(line);
      currentTokens += lineTokens;
    }

    // Don't forget the last chunk
    if (currentLines.length > 0) {
      const header = `// File: ${filepath}\n// ${chunk.chunk_type}: ${baseName} [part ${partNum}]\n`;
      const content = header + currentLines.join('\n');
      
      if (this.countTokens(content) >= this.minTokens) {
        subChunks.push({
          id: uuidv4(),
          content: content,
          tokens: this.countTokens(content),
          repo_id: repoId,
          filepath: filepath,
          chunk_type: chunk.chunk_type,
          language: language,
          metadata: {
            name: `${baseName}_part${partNum}`,
            start_line: startLine,
            end_line: chunk.metadata.end_line,
            parent_name: baseName,
            part_number: partNum,
            imports: chunk.metadata.imports || ''
          }
        });
      }
    }

    return subChunks;
  }


  chunkJavaScript(filepath, content, language, repoId) {
    const chunks = [];
    const lines = content.split('\n');
    
    // Extract imports first (to include as context)
    const imports = lines.filter(l => 
      l.trim().startsWith('import ') || 
      l.trim().startsWith('const ') && l.includes('require(')
    ).join('\n');

    let currentChunk = '';
    let currentType = 'module';
    let currentName = 'module';
    let startLine = 0;
    let braceDepth = 0;
    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk += line + '\n';

      // Track brace depth for block detection
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // Check if we're starting a new function/class
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      const arrowMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);

      if ((funcMatch || arrowMatch || classMatch) && braceDepth <= 1) {
        // Save previous chunk if substantial
        if (currentChunk.trim() && this.countTokens(currentChunk) >= this.minTokens) {
          const prevContent = currentChunk.slice(0, currentChunk.lastIndexOf(line));
          if (prevContent.trim()) {
            chunks.push(this.createChunk(
              filepath, prevContent.trim(), currentType, currentName,
              startLine, i - 1, language, repoId, imports
            ));
          }
        }
        
        currentChunk = line + '\n';
        startLine = i;
        currentType = classMatch ? 'class' : 'function';
        currentName = (funcMatch || arrowMatch || classMatch)[1];
        inBlock = true;
      }

      // Check if block ended (back to depth 0)
      if (inBlock && braceDepth === 0 && closeBraces > 0) {
        chunks.push(this.createChunk(
          filepath, currentChunk.trim(), currentType, currentName,
          startLine, i, language, repoId, imports
        ));
        currentChunk = '';
        currentType = 'module';
        currentName = 'module';
        startLine = i + 1;
        inBlock = false;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim() && this.countTokens(currentChunk) >= this.minTokens) {
      chunks.push(this.createChunk(
        filepath, currentChunk.trim(), currentType, currentName,
        startLine, lines.length - 1, language, repoId, imports
      ));
    }

    // If no chunks created, treat whole file as one chunk
    if (chunks.length === 0 && content.trim()) {
      chunks.push(this.createChunk(
        filepath, content, 'file', path.basename(filepath),
        0, lines.length - 1, language, repoId, ''
      ));
    }

    return chunks;
  }


  chunkPython(filepath, content, repoId) {
    const chunks = [];
    const lines = content.split('\n');
    
    const imports = lines.filter(l => 
      l.trim().startsWith('import ') || l.trim().startsWith('from ')
    ).join('\n');

    let currentChunk = '';
    let currentType = 'module';
    let currentName = 'module';
    let startLine = 0;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.search(/\S/);
      
      const funcMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)/);
      const classMatch = line.match(/^(\s*)class\s+(\w+)/);

      if ((funcMatch || classMatch) && (indent === 0 || indent <= currentIndent)) {
        if (currentChunk.trim() && this.countTokens(currentChunk) >= this.minTokens) {
          chunks.push(this.createChunk(
            filepath, currentChunk.trim(), currentType, currentName,
            startLine, i - 1, 'python', repoId, imports
          ));
        }
        
        currentChunk = line + '\n';
        startLine = i;
        currentType = classMatch ? 'class' : 'function';
        currentName = (funcMatch || classMatch)[2];
        currentIndent = indent;
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim() && this.countTokens(currentChunk) >= this.minTokens) {
      chunks.push(this.createChunk(
        filepath, currentChunk.trim(), currentType, currentName,
        startLine, lines.length - 1, 'python', repoId, imports
      ));
    }

    if (chunks.length === 0 && content.trim()) {
      chunks.push(this.createChunk(
        filepath, content, 'file', path.basename(filepath),
        0, lines.length - 1, 'python', repoId, ''
      ));
    }

    return chunks;
  }


  chunkByLines(filepath, content, language, repoId) {
    const chunks = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      currentChunk += lines[i] + '\n';
      
      if (this.countTokens(currentChunk) >= this.maxTokens) {
        chunks.push(this.createChunk(
          filepath, currentChunk.trim(), 'segment', `lines_${startLine}_${i}`,
          startLine, i, language, repoId, ''
        ));
        currentChunk = '';
        startLine = i + 1;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        filepath, currentChunk.trim(), 'segment', `lines_${startLine}_${lines.length-1}`,
        startLine, lines.length - 1, language, repoId, ''
      ));
    }

    return chunks;
  }

  createChunk(filepath, content, chunkType, name, startLine, endLine, language, repoId, imports) {
    let header = `// File: ${filepath}\n`;
    if (chunkType !== 'file' && chunkType !== 'segment') {
      header += `// ${chunkType}: ${name}\n`;
    }
    
    const fullContent = header + content;
    
    return {
      id: uuidv4(),
      content: fullContent,
      tokens: this.countTokens(fullContent),
      repo_id: repoId,
      filepath: filepath,
      chunk_type: chunkType,
      language: language,
      metadata: {
        name: name,
        start_line: startLine,
        end_line: endLine,
        imports: imports
      }
    };
  }
}

module.exports = { NaiveChunker };
