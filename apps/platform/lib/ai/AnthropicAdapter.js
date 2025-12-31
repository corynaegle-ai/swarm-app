import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from './BaseAdapter.js';

export class AnthropicAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  async complete({ messages, system, tools }) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: system || 'You are a helpful AI assistant.',
      messages: messages,
      ...(tools && { tools }),
    });

    return {
      content: response.content[0]?.text || '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason,
      raw: response,
    };
  }

  async *stream({ messages, system, tools }) {
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: system || 'You are a helpful AI assistant.',
      messages: messages,
      ...(tools && { tools }),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        yield { delta: event.delta.text, done: false };
      }
    }
    yield { delta: '', done: true };
  }

  async validateKey() {
    try {
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  static getModels() {
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
    ];
  }
}
