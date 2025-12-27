// config.js - RAG Pipeline Configuration (Updated for smaller chunks)
require('dotenv').config();

module.exports = {
  // Server
  port: process.env.RAG_PORT || 8082,
  
  // PostgreSQL
  postgres: {
    connectionString: process.env.DATABASE_URL || 'postgresql://swarm:swarm@localhost:5432/swarmdb'
  },
  
  // Voyage AI Embeddings (code-optimized)
  voyage: {
    apiKey: process.env.VOYAGE_API_KEY,
    embeddingModel: 'voyage-code-3',
    embeddingDimensions: 1024
  },
  
  // Chunking - REDUCED SIZES for better retrieval
  chunking: {
    maxTokens: 400,           // Was 512, now 400 for better granularity
    minTokens: 30,            // Was 50, lowered to keep small functions
    overlapTokens: 50,        // NEW: Context overlap between chunks
    codeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'],
    docExtensions: ['.md', '.txt', '.rst'],
    ignorePaths: ['node_modules', 'dist', 'build', '.git', 'vendor', '__pycache__', '.next']
  },
  
  // Repository storage
  repoStoragePath: '/tmp/swarm-rag-repos',
  
  // Search defaults
  search: {
    defaultTopK: 10,
    similarityThreshold: 0.5
  }
};
