// index.js - Swarm RAG Service Entry Point
const { app } = require('./src/api');
const config = require('./config');

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    SWARM RAG SERVICE                      ║
╠═══════════════════════════════════════════════════════════╣
║  Status: Running                                          ║
║  Port: ${PORT}                                              ║
║  Embedding Model: ${config.voyage.embeddingModel.padEnd(28)}║
║  Vector Dimensions: ${config.voyage.embeddingDimensions}                                ║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  GET  /health                         - Health check
  GET  /api/rag/repositories           - List indexed repos
  POST /api/rag/repositories           - Register a repo
  GET  /api/rag/repositories/:id       - Get repo status
  POST /api/rag/repositories/:id/index - Trigger indexing
  POST /api/rag/index                  - Register + index in one call
  POST /api/rag/search                 - Semantic code search
  POST /api/rag/context                - Build LLM context
  `);
});
