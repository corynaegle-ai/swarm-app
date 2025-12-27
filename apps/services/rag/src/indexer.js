// src/indexer.js - Repository Indexer with Progress Tracking
const { glob } = require('glob');
const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { NaiveChunker } = require('./chunker');
const { EmbeddingService } = require('./embeddings');
const { VectorStore } = require('./vector-store');

class RepositoryIndexer {
  constructor() {
    this.chunker = new NaiveChunker();
    this.embeddings = new EmbeddingService();
    this.vectorStore = new VectorStore();
  }

  async indexRepository(repoUrl, options = {}) {
    const { branch = 'main', forceReindex = false } = options;
    
    // Normalize URL by removing .git suffix
    const normalizedUrl = repoUrl.replace(/\.git$/, '');
    
    console.log(`[Indexer] Starting index for: ${normalizedUrl}`);
    
    // Check if already indexed
    let repo = await this.vectorStore.getRepositoryByUrl(normalizedUrl);
    
    if (repo && repo.index_status === 'ready' && !forceReindex) {
      console.log(`[Indexer] Repository already indexed.`);
      return { status: 'already_indexed', repo_id: repo.id, chunk_count: repo.chunk_count };
    }

    // Create or update repository record
    const repoId = repo?.id || uuidv4();
    const repoName = this.extractRepoName(normalizedUrl);
    
    repo = await this.vectorStore.upsertRepository({
      id: repoId,
      url: normalizedUrl,
      name: repoName,
      branch: branch
    });
    
    // Initialize progress
    await this.vectorStore.updateRepoProgress(repoId, {
      status: 'cloning',
      phase: 'clone',
      files_total: 0,
      files_processed: 0,
      chunks_created: 0,
      percent: 5
    });

    try {
      // Clone repository
      const localPath = await this.cloneRepository(normalizedUrl, repoId, branch);
      
      // Delete existing chunks if re-indexing
      if (forceReindex) {
        await this.vectorStore.deleteByRepo(repoId);
      }

      // Find files
      await this.vectorStore.updateRepoProgress(repoId, {
        status: 'indexing',
        phase: 'scanning',
        percent: 10
      });

      const codeFiles = await this.findFiles(localPath, config.chunking.codeExtensions);
      console.log(`[Indexer] Found ${codeFiles.length} code files`);

      // Find documentation files
      const docFiles = await this.findFiles(localPath, config.chunking.docExtensions);
      console.log(`[Indexer] Found ${docFiles.length} documentation files`);

      // Combine all files
      const allFiles = [...codeFiles, ...docFiles];

      await this.vectorStore.updateRepoProgress(repoId, {
        phase: 'chunking',
        files_total: allFiles.length,
        files_processed: 0,
        percent: 15
      });

      // Chunk files with progress
      const allChunks = [];
      
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        try {
          const content = await fs.readFile(file, 'utf-8');
          const relativePath = path.relative(localPath, file);
          const chunks = this.chunker.chunkFile(relativePath, content, repoId);
          allChunks.push(...chunks);
        } catch (err) {
          console.warn(`[Indexer] Error processing ${file}: ${err.message}`);
        }

        // Update progress every 10 files or at end
        if (i % 10 === 0 || i === allFiles.length - 1) {
          const chunkingProgress = 15 + Math.floor((i / allFiles.length) * 25);
          await this.vectorStore.updateRepoProgress(repoId, {
            files_processed: i + 1,
            chunks_created: allChunks.length,
            percent: chunkingProgress
          });
        }
      }

      console.log(`[Indexer] Created ${allChunks.length} chunks`);

      if (allChunks.length === 0) {
        await this.vectorStore.updateRepoProgress(repoId, {
          status: 'ready',
          phase: 'complete',
          percent: 100
        });
        await this.vectorStore.updateRepoStatus(repoId, 'ready', 0);
        return { status: 'complete', repo_id: repoId, chunk_count: 0 };
      }

      // Generate embeddings
      await this.vectorStore.updateRepoProgress(repoId, {
        phase: 'embedding',
        percent: 45
      });

      console.log(`[Indexer] Generating embeddings...`);
      const contents = allChunks.map(c => c.content);
      
      // Embed in batches with progress
      const batchSize = 50;
      const embeddings = [];
      
      for (let i = 0; i < contents.length; i += batchSize) {
        const batch = contents.slice(i, i + batchSize);
        const batchEmbeddings = await this.embeddings.embed(batch);
        embeddings.push(...batchEmbeddings);

        const embeddingProgress = 45 + Math.floor((i / contents.length) * 35);
        await this.vectorStore.updateRepoProgress(repoId, {
          percent: embeddingProgress
        });
      }

      // Attach embeddings
      for (let i = 0; i < allChunks.length; i++) {
        allChunks[i].embedding = embeddings[i];
      }

      // Store in vector DB
      await this.vectorStore.updateRepoProgress(repoId, {
        phase: 'storing',
        percent: 85
      });

      console.log(`[Indexer] Storing ${allChunks.length} chunks...`);
      for (let i = 0; i < allChunks.length; i++) {
        await this.vectorStore.upsertChunk(allChunks[i]);
        
        if (i % 50 === 0) {
          const storeProgress = 85 + Math.floor((i / allChunks.length) * 10);
          await this.vectorStore.updateRepoProgress(repoId, { percent: storeProgress });
        }
      }

      // Complete
      await this.vectorStore.updateRepoProgress(repoId, {
        status: 'ready',
        phase: 'complete',
        percent: 100,
        chunks_created: allChunks.length
      });
      await this.vectorStore.updateRepoStatus(repoId, 'ready', allChunks.length);
      
      // Cleanup
      await this.cleanup(localPath);

      console.log(`[Indexer] Complete! ${allChunks.length} chunks indexed.`);
      return { status: 'complete', repo_id: repoId, chunk_count: allChunks.length };

    } catch (error) {
      console.error(`[Indexer] Error:`, error);
      await this.vectorStore.updateRepoProgress(repoId, {
        status: 'error',
        phase: 'failed',
        error: error.message
      });
      await this.vectorStore.updateRepoStatus(repoId, 'error');
      throw error;
    }
  }

  extractRepoName(url) {
    return url.match(/\/([^\/]+?)(?:\.git)?$/)?.[1] || 'unknown';
  }

  async cloneRepository(repoUrl, repoId, branch) {
    const localPath = path.join('/tmp', `rag-${repoId}`);
    
    try {
      await fs.rm(localPath, { recursive: true, force: true });
    } catch (e) {}

    const git = simpleGit();
    await git.clone(repoUrl, localPath, ['--branch', branch, '--depth', '1']);
    
    return localPath;
  }

  async findFiles(dir, extensions) {
    const patterns = extensions.map(ext => `**/*${ext}`);
    const files = await glob(patterns, {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/vendor/**']
    });
    return files;
  }

  async cleanup(localPath) {
    try {
      await fs.rm(localPath, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[Indexer] Cleanup warning: ${e.message}`);
    }
  }
}

module.exports = { RepositoryIndexer };
