/**
 * Base AI Adapter - Abstract interface for all AI providers
 */
export class BaseAdapter {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  /**
   * Send a completion request to the AI provider
   * @param {Object} params - { messages, system, tools }
   * @returns {Promise<{ content: string, usage: Object, stopReason: string }>}
   */
  async complete(params) {
    throw new Error('complete() must be implemented by subclass');
  }

  /**
   * Stream a completion request
   * @param {Object} params - { messages, system, tools }
   * @returns {AsyncGenerator<{ delta: string, done: boolean }>}
   */
  async *stream(params) {
    throw new Error('stream() must be implemented by subclass');
  }

  /**
   * Validate the API key works
   * @returns {Promise<{ valid: boolean, error?: string }>}
   */
  async validateKey() {
    throw new Error('validateKey() must be implemented by subclass');
  }

  /**
   * Get provider-specific model list
   * @returns {Array<{ id: string, name: string, contextWindow: number }>}
   */
  static getModels() {
    throw new Error('getModels() must be implemented by subclass');
  }
}
