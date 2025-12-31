import OpenAI from 'openai';
import { BaseAdapter } from './BaseAdapter.js';

export class OpenAIAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async complete({ messages, system, tools }) {
    const allMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: allMessages,
      ...(tools && { tools: this._convertTools(tools) }),
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      },
      stopReason: response.choices[0]?.finish_reason,
      raw: response,
    };
  }

  async *stream({ messages, system, tools }) {
    const allMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: allMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        yield { delta, done: false };
      }
    }
    yield { delta: '', done: true };
  }

  async validateKey() {
    try {
      await this.client.models.list();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  _convertTools(anthropicTools) {
    // Convert Anthropic tool format to OpenAI format
    return anthropicTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  static getModels() {
    return [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000 },
      { id: 'o1-preview', name: 'o1 Preview', contextWindow: 128000 },
    ];
  }
}
