import { AnthropicAdapter } from './AnthropicAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { MistralAdapter } from './MistralAdapter.js';

const ADAPTERS = {
  anthropic: AnthropicAdapter,
  openai: OpenAIAdapter,
  mistral: MistralAdapter,
};

/**
 * Factory for creating AI provider adapters
 */
export class AdapterFactory {
  /**
   * Create an adapter instance for the specified provider
   * @param {string} providerId - 'anthropic', 'openai', 'mistral', etc.
   * @param {Object} config - { apiKey, model, temperature, maxTokens }
   * @returns {BaseAdapter}
   */
  static create(providerId, config) {
    const AdapterClass = ADAPTERS[providerId];
    if (!AdapterClass) {
      throw new Error(`Unknown provider: ${providerId}. Available: ${Object.keys(ADAPTERS).join(', ')}`);
    }
    return new AdapterClass(config);
  }

  /**
   * Get list of supported providers
   * @returns {Array<{ id: string, name: string, models: Array }>}
   */
  static getProviders() {
    return [
      { id: 'anthropic', name: 'Anthropic', models: AnthropicAdapter.getModels() },
      { id: 'openai', name: 'OpenAI', models: OpenAIAdapter.getModels() },
      { id: 'mistral', name: 'Mistral', models: MistralAdapter.getModels() },
    ];
  }

  /**
   * Create adapter using stored config from database
   * @param {Object} db - Database connection
   * @param {string} tenantId - Tenant identifier
   * @param {string} agentType - 'coder', 'reviewer', 'design', etc.
   * @returns {Promise<BaseAdapter>}
   */
  static async createFromConfig(db, tenantId, agentType = 'default') {
    // Get model config
    const configResult = await db.query(
      `SELECT provider_id, model_id, temperature, max_tokens 
       FROM model_configs 
       WHERE tenant_id = $1 AND agent_type = $2`,
      [tenantId, agentType]
    );

    // Fall back to default config if none set
    const modelConfig = configResult.rows[0] || {
      provider_id: 'anthropic',
      model_id: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      max_tokens: 4096,
    };

    // Get decrypted API key
    const keyResult = await db.query(
      `SELECT encrypted_api_key, iv, auth_tag 
       FROM api_keys 
       WHERE tenant_id = $1 AND provider_id = $2`,
      [tenantId, modelConfig.provider_id]
    );

    if (!keyResult.rows[0]) {
      throw new Error(`No API key configured for provider: ${modelConfig.provider_id}`);
    }

    // Decrypt key (using encryption module)
    const { decrypt } = await import('../encryption.js');
    const apiKey = decrypt(
      keyResult.rows[0].encrypted_api_key,
      keyResult.rows[0].iv,
      keyResult.rows[0].auth_tag
    );

    return AdapterFactory.create(modelConfig.provider_id, {
      apiKey,
      model: modelConfig.model_id,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.max_tokens,
    });
  }
}
