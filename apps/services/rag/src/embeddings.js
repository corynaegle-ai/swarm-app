// src/embeddings.js - Voyage AI Embeddings Service (code-optimized)
const config = require('../config');

class EmbeddingService {
  constructor() {
    this.apiKey = config.voyage.apiKey;
    this.model = config.voyage.embeddingModel;
    this.dimensions = config.voyage.embeddingDimensions;
    this.baseUrl = 'https://api.voyageai.com/v1/embeddings';
    this.maxTokensPerText = 16000; // Voyage supports up to 32K, being conservative
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  truncateToTokenLimit(text, maxTokens = this.maxTokensPerText) {
    const estimated = this.estimateTokens(text);
    if (estimated <= maxTokens) return text;
    const maxChars = maxTokens * 4;
    return text.substring(0, maxChars) + '\n// [truncated]';
  }

  async embed(texts) {
    if (!Array.isArray(texts)) {
      texts = [texts];
    }

    const processedTexts = texts.map(t => this.truncateToTokenLimit(t));

    // Voyage batch limit is 128 texts
    const batchSize = 128;
    const allEmbeddings = [];

    for (let i = 0; i < processedTexts.length; i += batchSize) {
      const batch = processedTexts.slice(i, i + batchSize);
      
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            input: batch,
            input_type: 'document'  // 'document' for indexing, 'query' for search
          })
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Voyage API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const embeddings = data.data.map(item => item.embedding);
        allEmbeddings.push(...embeddings);
        
        console.log(`[Embeddings] Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} texts embedded`);
      } catch (error) {
        console.error(`Embedding batch failed:`, error.message);
        // Fill with zeros for failed batch
        for (let j = 0; j < batch.length; j++) {
          allEmbeddings.push(new Array(this.dimensions).fill(0));
        }
      }
      
      if (i + batchSize < processedTexts.length) {
        await this.sleep(100);
      }
    }

    return allEmbeddings;
  }

  async embedSingle(text, inputType = 'query') {
    const processedText = this.truncateToTokenLimit(text);
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: [processedText],
        input_type: inputType  // 'query' for search queries
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { EmbeddingService };
