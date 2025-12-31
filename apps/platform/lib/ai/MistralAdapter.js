import { BaseAdapter } from './BaseAdapter.js';

export class MistralAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.baseUrl = 'https://api.mistral.ai/v1';
  }

  async complete({ messages, system, tools }) {
    const allMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: allMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
      stopReason: data.choices[0]?.finish_reason,
      raw: data,
    };
  }

  async *stream({ messages, system }) {
    const allMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: allMessages,
        stream: true,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices[0]?.delta?.content || '';
          if (delta) yield { delta, done: false };
        } catch {}
      }
    }
    yield { delta: '', done: true };
  }

  async validateKey() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return { valid: response.ok };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  static getModels() {
    return [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000 },
      { id: 'codestral-latest', name: 'Codestral', contextWindow: 32000 },
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 32000 },
    ];
  }
}
