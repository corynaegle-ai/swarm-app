// src/vector-store.js - pgvector interface with progress tracking
const { Pool } = require('pg');
const config = require('../config');

class VectorStore {
  constructor() {
    this.pool = new Pool({
      connectionString: config.postgres.connectionString
    });
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
    
    const embeddingStr = `[${chunk.embedding.join(',')}]`;
    
    const values = [
      chunk.id,
      chunk.content,
      chunk.tokens,
      embeddingStr,
      chunk.repo_id,
      chunk.filepath,
      chunk.branch || 'main',
      chunk.chunk_type,
      chunk.language,
      JSON.stringify(chunk.metadata || {})
    ];
    
    return this.pool.query(query, values);
  }

  async searchSimilar(embedding, options = {}) {
    const {
      limit = config.search.defaultTopK,
      threshold = config.search.similarityThreshold,
      repo_id = null,
      chunk_types = null
    } = options;

    const embeddingStr = `[${embedding.join(',')}]`;
    
    let query = `
      SELECT 
        id, content, tokens, chunk_type, language, filepath, metadata,
        1 - (embedding <=> $1) as similarity
      FROM code_chunks
      WHERE 1 - (embedding <=> $1) > $2
    `;
    
    const params = [embeddingStr, threshold];
    let paramIndex = 3;
    
    if (repo_id) {
      query += ` AND repo_id = $${paramIndex}`;
      params.push(repo_id);
      paramIndex++;
    }
    
    if (chunk_types && chunk_types.length > 0) {
      query += ` AND chunk_type = ANY($${paramIndex})`;
      params.push(chunk_types);
      paramIndex++;
    }
    
    query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async deleteByRepo(repo_id) {
    await this.pool.query('DELETE FROM code_chunks WHERE repo_id = $1', [repo_id]);
  }

  async getChunkCount(repo_id) {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM code_chunks WHERE repo_id = $1',
      [repo_id]
    );
    return parseInt(result.rows[0].count);
  }

  // Repository management
  async upsertRepository(repo) {
    const query = `
      INSERT INTO rag_repositories (id, url, name, default_branch, metadata)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (url) DO UPDATE SET
        name = EXCLUDED.name,
        default_branch = EXCLUDED.default_branch,
        metadata = EXCLUDED.metadata
      RETURNING *
    `;
    const result = await this.pool.query(query, [
      repo.id, repo.url, repo.name, repo.branch || 'main', JSON.stringify(repo.metadata || {})
    ]);
    return result.rows[0];
  }

  async updateRepoStatus(repo_id, status, chunk_count = null) {
    let query = `UPDATE rag_repositories SET index_status = $1`;
    const params = [status];
    
    if (status === 'ready') {
      query += `, last_indexed_at = NOW()`;
    }
    if (chunk_count !== null) {
      query += `, chunk_count = $${params.length + 1}`;
      params.push(chunk_count);
    }
    
    query += ` WHERE id = $${params.length + 1}`;
    params.push(repo_id);
    
    await this.pool.query(query, params);
  }

  /**
   * Update indexing progress for a repository
   * @param {string} repo_id - Repository ID
   * @param {Object} progress - Progress data
   */
  async updateRepoProgress(repo_id, progress) {
    // Merge with existing progress
    const current = await this.getRepository(repo_id);
    const currentProgress = current?.indexing_progress || {};
    
    const updatedProgress = {
      ...currentProgress,
      ...progress,
      updated_at: new Date().toISOString()
    };

    // Also update index_status if provided
    let query = `UPDATE rag_repositories SET indexing_progress = $1`;
    const params = [JSON.stringify(updatedProgress)];

    if (progress.status) {
      query += `, index_status = $${params.length + 1}`;
      params.push(progress.status);
    }

    query += ` WHERE id = $${params.length + 1}`;
    params.push(repo_id);

    await this.pool.query(query, params);
  }

  async getRepository(repo_id) {
    const result = await this.pool.query(
      'SELECT * FROM rag_repositories WHERE id = $1',
      [repo_id]
    );
    return result.rows[0];
  }

  async getRepositoryByUrl(url) {
    // Normalize URL by removing .git suffix for matching
    const normalizedUrl = url.replace(/\.git$/, '');
    const result = await this.pool.query(
      'SELECT * FROM rag_repositories WHERE url = $1 OR url = $2',
      [url, normalizedUrl]
    );
    return result.rows[0];
  }

  async listRepositories() {
    const result = await this.pool.query(
      'SELECT * FROM rag_repositories ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async deleteRepository(repo_id) {
    await this.pool.query('DELETE FROM rag_repositories WHERE id = $1', [repo_id]);
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { VectorStore };
