import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';

export const httpRequest: StepDefinition = {
  id: 'http-request',
  name: 'HTTP Request',
  description: 'Make an HTTP request to an external API',
  category: 'integration',
  icon: '🔗',
  inputs: [
    { name: 'url', type: 'string', label: 'URL', required: true },
    { name: 'method', type: 'select', label: 'Method', required: true, default: 'GET',
      options: [
        { label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }
      ]},
    { name: 'headers', type: 'json', label: 'Headers', required: false, default: {} },
    { name: 'body', type: 'json', label: 'Body', required: false }
  ],
  outputs: [
    { name: 'status', type: 'number', label: 'Status Code' },
    { name: 'data', type: 'json', label: 'Response Data' },
    { name: 'headers', type: 'json', label: 'Response Headers' }
  ],
  execute: async (inputs): Promise<StepExecuteResult> => {
    try {
      const { url, method, headers, body } = inputs as { url: string; method: string; headers?: Record<string, string>; body?: unknown };
      
      const res = await fetch(url, {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined
      });

      let data: unknown;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      return {
        success: res.ok,
        outputs: { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) },
        error: res.ok ? undefined : `HTTP ${res.status}`
      };
    } catch (e) {
      return { success: false, outputs: {}, error: (e as Error).message };
    }
  }
};

registry.register(httpRequest);
