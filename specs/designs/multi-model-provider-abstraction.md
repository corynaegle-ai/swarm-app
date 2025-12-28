# Multi-Model Provider Abstraction

**Status:** Future Enhancement  
**Priority:** High  
**Estimated Effort:** 4-6 weeks  
**Author:** Neural (Claude Opus 4.5)  
**Date:** 2024-12-22

---

## Executive Summary

This design introduces a provider abstraction layer that enables Swarm to use multiple LLM providers (Anthropic, OpenAI, DeepSeek, Ollama) with intelligent routing based on agent type, cost optimization, and tenant preferences. This unlocks 14x cost savings for routine tasks while maintaining Claude quality for complex reasoning.

---

## Goals

1. **Provider Agnosticism** - Decouple agent logic from specific LLM providers
2. **Cost Optimization** - Route routine tasks to cheaper models (DeepSeek: $0.27/1M vs Claude: $3/1M)
3. **Enterprise Flexibility** - Support customer-mandated providers (OpenAI for GitHub shops)
4. **Vendor Redundancy** - Automatic failover if primary provider has outage
5. **Self-Hosted Option** - Enable air-gapped deployments via Ollama

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Swarm Orchestrator                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Design Agent │  │ Worker Agent │  │ Review Agent │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Model Router                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Routing Rules Engine                                 │  │  │
│  │  │ - Agent type mapping                                 │  │  │
│  │  │ - Tenant preferences                                 │  │  │
│  │  │ - Cost optimization                                  │  │  │
│  │  │ - Capability matching                                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Anthropic   │      │    OpenAI     │      │   DeepSeek    │
│    Adapter    │      │    Adapter    │      │    Adapter    │
└───────────────┘      └───────────────┘      └───────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  Claude API   │      │  OpenAI API   │      │ DeepSeek API  │
│  Sonnet 4     │      │  GPT-4o       │      │  V3 / R1      │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## Core Interfaces

### LLMProvider Interface

```typescript
// /opt/swarm/src/providers/types.ts

/**
 * Represents a message in a conversation
 */
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/**
 * Tool/function definition for models that support tool calling
 */
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/**
 * Common completion options across all providers
 */
interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none' | { name: string };
}

/**
 * Standardized response format
 */
interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  latencyMs: number;
  cost: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Provider capabilities for routing decisions
 */
interface ProviderCapabilities {
  maxContextLength: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsSystemPrompt: boolean;
  supportedLanguages: string[]; // For code models
}

/**
 * Cost structure per provider/model
 */
interface CostStructure {
  inputPer1kTokens: number;  // USD
  outputPer1kTokens: number; // USD
  currency: 'USD';
}

/**
 * Core provider interface - all adapters must implement
 */
interface LLMProvider {
  // Metadata
  readonly name: string;
  readonly displayName: string;
  readonly models: string[];
  readonly capabilities: ProviderCapabilities;
  readonly costs: Record<string, CostStructure>;
  
  // Health check
  healthCheck(): Promise<boolean>;
  
  // Core completion methods
  complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResponse>;
  
  completeStream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncGenerator<string, CompletionResponse>;
  
  // Token counting (for context management)
  countTokens(text: string): Promise<number>;
  
  // Model-specific configuration
  getDefaultModel(): string;
  validateModel(model: string): boolean;
}
```

### Provider Registry

```typescript
// /opt/swarm/src/providers/registry.ts

/**
 * Central registry for all available providers
 */
class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string = 'anthropic';
  
  /**
   * Register a new provider
   */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }
  
  /**
   * Get provider by name
   */
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
  
  /**
   * Get all registered providers
   */
  getAll(): LLMProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get providers that support a specific capability
   */
  getByCapability(capability: keyof ProviderCapabilities): LLMProvider[] {
    return this.getAll().filter(p => p.capabilities[capability]);
  }
  
  /**
   * Get the cheapest provider for a given token count
   */
  getCheapest(estimatedTokens: number): LLMProvider {
    return this.getAll().reduce((cheapest, current) => {
      const cheapestCost = this.estimateCost(cheapest, estimatedTokens);
      const currentCost = this.estimateCost(current, estimatedTokens);
      return currentCost < cheapestCost ? current : cheapest;
    });
  }
  
  private estimateCost(provider: LLMProvider, tokens: number): number {
    const model = provider.getDefaultModel();
    const costs = provider.costs[model];
    // Assume 30% input, 70% output ratio
    return (tokens * 0.3 * costs.inputPer1kTokens / 1000) +
           (tokens * 0.7 * costs.outputPer1kTokens / 1000);
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();
```

---

## Model Router

### Routing Rules Engine

```typescript
// /opt/swarm/src/providers/router.ts

/**
 * Agent types that influence model selection
 */
type AgentType = 
  | 'design'      // High reasoning, architecture decisions
  | 'worker'      // Code generation, routine tasks
  | 'review'      // Code review, quality assessment
  | 'completion'  // Fast autocomplete, inline suggestions
  | 'test'        // Test generation
  | 'docs';       // Documentation generation

/**
 * Routing strategy options
 */
type RoutingStrategy = 
  | 'quality'     // Best model regardless of cost
  | 'balanced'    // Balance quality and cost
  | 'cost'        // Minimize cost
  | 'speed';      // Minimize latency

/**
 * Tenant-level preferences
 */
interface TenantModelPreferences {
  tenantId: string;
  strategy: RoutingStrategy;
  preferredProviders: string[];      // Ordered preference
  blockedProviders: string[];        // Compliance/policy blocks
  modelOverrides: Record<AgentType, string>; // Explicit overrides
  maxCostPerRequest?: number;        // Budget cap
  requireToolCalling?: boolean;
}

/**
 * Default routing rules per agent type
 */
const DEFAULT_ROUTING_RULES: Record<AgentType, RoutingRule> = {
  design: {
    requiredCapabilities: ['supportsToolCalling', 'supportsSystemPrompt'],
    minContextLength: 100000,
    preferredModels: [
      'anthropic:claude-sonnet-4',
      'openai:gpt-4o',
      'deepseek:deepseek-v3'
    ],
    strategy: 'quality'
  },
  worker: {
    requiredCapabilities: ['supportsToolCalling'],
    minContextLength: 32000,
    preferredModels: [
      'deepseek:deepseek-v3',      // Cost optimized
      'anthropic:claude-sonnet-4',
      'openai:gpt-4o'
    ],
    strategy: 'balanced'
  },
  review: {
    requiredCapabilities: ['supportsSystemPrompt'],
    minContextLength: 64000,
    preferredModels: [
      'anthropic:claude-sonnet-4', // Best judgment
      'openai:gpt-4o',
      'deepseek:deepseek-v3'
    ],
    strategy: 'quality'
  },
  completion: {
    requiredCapabilities: [],
    minContextLength: 8000,
    preferredModels: [
      'mistral:codestral',         // Fastest
      'deepseek:deepseek-coder',
      'openai:gpt-4o-mini'
    ],
    strategy: 'speed'
  },
  test: {
    requiredCapabilities: ['supportsToolCalling'],
    minContextLength: 32000,
    preferredModels: [
      'deepseek:deepseek-v3',
      'anthropic:claude-sonnet-4',
      'openai:gpt-4o'
    ],
    strategy: 'cost'
  },
  docs: {
    requiredCapabilities: [],
    minContextLength: 16000,
    preferredModels: [
      'deepseek:deepseek-v3',
      'openai:gpt-4o-mini',
      'anthropic:claude-haiku'
    ],
    strategy: 'cost'
  }
};

/**
 * Model Router - selects optimal model for each request
 */
class ModelRouter {
  constructor(
    private registry: ProviderRegistry,
    private tenantPrefs: TenantModelPreferences | null = null
  ) {}
  
  /**
   * Select the best model for an agent type
   */
  async selectModel(
    agentType: AgentType,
    context?: {
      estimatedTokens?: number;
      requiresVision?: boolean;
      requiresStreaming?: boolean;
    }
  ): Promise<{ provider: LLMProvider; model: string }> {
    
    // 1. Check for explicit tenant override
    if (this.tenantPrefs?.modelOverrides[agentType]) {
      const override = this.tenantPrefs.modelOverrides[agentType];
      const [providerName, model] = override.split(':');
      const provider = this.registry.get(providerName);
      if (provider && !this.isBlocked(providerName)) {
        return { provider, model };
      }
    }
    
    // 2. Get base routing rule
    const rule = DEFAULT_ROUTING_RULES[agentType];
    
    // 3. Apply tenant strategy override
    const strategy = this.tenantPrefs?.strategy ?? rule.strategy;
    
    // 4. Filter candidates by capabilities
    const candidates = this.filterCandidates(rule, context);
    
    // 5. Apply tenant preferences
    const ranked = this.rankByPreference(candidates);
    
    // 6. Select based on strategy
    const selected = this.selectByStrategy(ranked, strategy);
    
    if (!selected) {
      throw new Error(`No suitable model found for agent type: ${agentType}`);
    }
    
    return selected;
  }
  
  /**
   * Get fallback chain for resilience
   */
  getFallbackChain(primary: string): string[] {
    const [providerName] = primary.split(':');
    
    // Return other providers in preference order
    return this.registry.getAll()
      .filter(p => p.name !== providerName)
      .filter(p => !this.isBlocked(p.name))
      .map(p => `${p.name}:${p.getDefaultModel()}`);
  }
  
  private isBlocked(providerName: string): boolean {
    return this.tenantPrefs?.blockedProviders.includes(providerName) ?? false;
  }
  
  private filterCandidates(
    rule: RoutingRule,
    context?: { requiresVision?: boolean; requiresStreaming?: boolean }
  ): Array<{ provider: LLMProvider; model: string }> {
    const candidates: Array<{ provider: LLMProvider; model: string }> = [];
    
    for (const modelSpec of rule.preferredModels) {
      const [providerName, model] = modelSpec.split(':');
      const provider = this.registry.get(providerName);
      
      if (!provider) continue;
      if (this.isBlocked(providerName)) continue;
      
      // Check capabilities
      const caps = provider.capabilities;
      if (caps.maxContextLength < rule.minContextLength) continue;
      if (context?.requiresVision && !caps.supportsVision) continue;
      if (context?.requiresStreaming && !caps.supportsStreaming) continue;
      
      for (const reqCap of rule.requiredCapabilities) {
        if (!caps[reqCap as keyof ProviderCapabilities]) continue;
      }
      
      candidates.push({ provider, model });
    }
    
    return candidates;
  }
  
  private rankByPreference(
    candidates: Array<{ provider: LLMProvider; model: string }>
  ): Array<{ provider: LLMProvider; model: string }> {
    if (!this.tenantPrefs?.preferredProviders.length) {
      return candidates;
    }
    
    return candidates.sort((a, b) => {
      const aIndex = this.tenantPrefs!.preferredProviders.indexOf(a.provider.name);
      const bIndex = this.tenantPrefs!.preferredProviders.indexOf(b.provider.name);
      
      // Preferred providers first, then maintain original order
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }
  
  private selectByStrategy(
    candidates: Array<{ provider: LLMProvider; model: string }>,
    strategy: RoutingStrategy
  ): { provider: LLMProvider; model: string } | null {
    if (candidates.length === 0) return null;
    
    switch (strategy) {
      case 'quality':
        // First candidate is highest quality (from preferredModels order)
        return candidates[0];
        
      case 'cost':
        // Sort by cost, return cheapest
        return candidates.sort((a, b) => {
          const aCost = a.provider.costs[a.model];
          const bCost = b.provider.costs[b.model];
          return (aCost.inputPer1kTokens + aCost.outputPer1kTokens) -
                 (bCost.inputPer1kTokens + bCost.outputPer1kTokens);
        })[0];
        
      case 'speed':
        // Prefer smaller/faster models (heuristic: lower cost = usually faster)
        return candidates.sort((a, b) => {
          const aCost = a.provider.costs[a.model];
          const bCost = b.provider.costs[b.model];
          return (aCost.outputPer1kTokens) - (bCost.outputPer1kTokens);
        })[0];
        
      case 'balanced':
      default:
        // Use second candidate if available (first is quality, skip to balanced)
        return candidates[Math.min(1, candidates.length - 1)];
    }
  }
}

export { ModelRouter, AgentType, RoutingStrategy, TenantModelPreferences };
```

---

## Provider Adapters

### Anthropic Adapter

```typescript
// /opt/swarm/src/providers/adapters/anthropic.ts

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Claude';
  readonly models = [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-haiku-3-20240307'
  ];
  
  readonly capabilities = {
    maxContextLength: 200000,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsVision: true,
    supportsSystemPrompt: true,
    supportedLanguages: ['*'] // All languages
  };
  
  readonly costs = {
    'claude-sonnet-4-20250514': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015, currency: 'USD' },
    'claude-opus-4-20250514': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075, currency: 'USD' },
    'claude-haiku-3-20240307': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125, currency: 'USD' }
  };
  
  private client: Anthropic;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.getDefaultModel(),
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      });
      return true;
    } catch {
      return false;
    }
  }
  
  async complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const startTime = Date.now();
    
    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const response = await this.client.messages.create({
      model: options.model ?? this.getDefaultModel(),
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: this.convertMessages(conversationMessages),
      tools: options.tools ? this.convertTools(options.tools) : undefined,
      tool_choice: options.toolChoice ? this.convertToolChoice(options.toolChoice) : undefined
    });
    
    const latencyMs = Date.now() - startTime;
    const model = options.model ?? this.getDefaultModel();
    const costs = this.costs[model];
    
    return {
      content: this.extractContent(response),
      toolCalls: this.extractToolCalls(response),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      model,
      provider: this.name,
      latencyMs,
      cost: {
        input: (response.usage.input_tokens / 1000) * costs.inputPer1kTokens,
        output: (response.usage.output_tokens / 1000) * costs.outputPer1kTokens,
        total: ((response.usage.input_tokens / 1000) * costs.inputPer1kTokens) +
               ((response.usage.output_tokens / 1000) * costs.outputPer1kTokens)
      }
    };
  }
  
  async *completeStream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncGenerator<string, CompletionResponse> {
    // Implementation with streaming...
    // Similar to complete() but uses stream: true
  }
  
  async countTokens(text: string): Promise<number> {
    // Use Anthropic's token counting endpoint or estimate
    // Rough estimate: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }
  
  getDefaultModel(): string {
    return 'claude-sonnet-4-20250514';
  }
  
  validateModel(model: string): boolean {
    return this.models.includes(model);
  }
  
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
  }
  
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema
    }));
  }
  
  private convertToolChoice(choice: CompletionOptions['toolChoice']): Anthropic.ToolChoice {
    if (typeof choice === 'string') {
      return { type: choice };
    }
    return { type: 'tool', name: choice!.name };
  }
  
  private extractContent(response: Anthropic.Message): string {
    return response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');
  }
  
  private extractToolCalls(response: Anthropic.Message): ToolCall[] | undefined {
    const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
    if (toolUseBlocks.length === 0) return undefined;
    
    return toolUseBlocks.map(block => ({
      id: (block as Anthropic.ToolUseBlock).id,
      name: (block as Anthropic.ToolUseBlock).name,
      arguments: (block as Anthropic.ToolUseBlock).input
    }));
  }
}

export { AnthropicProvider };
```

### DeepSeek Adapter

```typescript
// /opt/swarm/src/providers/adapters/deepseek.ts

import { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';
  readonly displayName = 'DeepSeek';
  readonly models = [
    'deepseek-chat',      // DeepSeek-V3
    'deepseek-coder',     // Code-optimized
    'deepseek-reasoner'   // DeepSeek-R1
  ];
  
  readonly capabilities = {
    maxContextLength: 128000,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsVision: false,
    supportsSystemPrompt: true,
    supportedLanguages: ['*']
  };
  
  // 14x cheaper than Claude!
  readonly costs = {
    'deepseek-chat': { inputPer1kTokens: 0.00027, outputPer1kTokens: 0.0011, currency: 'USD' },
    'deepseek-coder': { inputPer1kTokens: 0.00027, outputPer1kTokens: 0.0011, currency: 'USD' },
    'deepseek-reasoner': { inputPer1kTokens: 0.00055, outputPer1kTokens: 0.0022, currency: 'USD' }
  };
  
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const startTime = Date.now();
    const model = options.model ?? this.getDefaultModel();
    
    // DeepSeek uses OpenAI-compatible API
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: this.convertMessages(messages),
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        tools: options.tools ? this.convertTools(options.tools) : undefined,
        tool_choice: options.toolChoice
      })
    });
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }
    
    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const costs = this.costs[model];
    
    return {
      content: data.choices[0].message.content ?? '',
      toolCalls: data.choices[0].message.tool_calls,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      },
      model,
      provider: this.name,
      latencyMs,
      cost: {
        input: (data.usage.prompt_tokens / 1000) * costs.inputPer1kTokens,
        output: (data.usage.completion_tokens / 1000) * costs.outputPer1kTokens,
        total: ((data.usage.prompt_tokens / 1000) * costs.inputPer1kTokens) +
               ((data.usage.completion_tokens / 1000) * costs.outputPer1kTokens)
      }
    };
  }
  
  async *completeStream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncGenerator<string, CompletionResponse> {
    // Streaming implementation using SSE
  }
  
  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
  
  getDefaultModel(): string {
    return 'deepseek-chat';
  }
  
  validateModel(model: string): boolean {
    return this.models.includes(model);
  }
  
  private convertMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }
  
  private convertTools(tools: ToolDefinition[]): Array<{ type: string; function: unknown }> {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }
}

export { DeepSeekProvider };
```

### OpenAI Adapter

```typescript
// /opt/swarm/src/providers/adapters/openai.ts

import OpenAI from 'openai';
import { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly displayName = 'OpenAI';
  readonly models = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4.1'  // Latest
  ];
  
  readonly capabilities = {
    maxContextLength: 128000,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsVision: true,
    supportsSystemPrompt: true,
    supportedLanguages: ['*']
  };
  
  readonly costs = {
    'gpt-4o': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01, currency: 'USD' },
    'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006, currency: 'USD' },
    'gpt-4-turbo': { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03, currency: 'USD' },
    'gpt-4.1': { inputPer1kTokens: 0.002, outputPer1kTokens: 0.008, currency: 'USD' }
  };
  
  private client: OpenAI;
  
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
  
  async complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const startTime = Date.now();
    const model = options.model ?? this.getDefaultModel();
    
    const response = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      tools: options.tools ? this.convertTools(options.tools) : undefined,
      tool_choice: options.toolChoice as OpenAI.ChatCompletionToolChoiceOption
    });
    
    const latencyMs = Date.now() - startTime;
    const costs = this.costs[model];
    const usage = response.usage!;
    
    return {
      content: response.choices[0].message.content ?? '',
      toolCalls: response.choices[0].message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      })),
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      },
      model,
      provider: this.name,
      latencyMs,
      cost: {
        input: (usage.prompt_tokens / 1000) * costs.inputPer1kTokens,
        output: (usage.completion_tokens / 1000) * costs.outputPer1kTokens,
        total: ((usage.prompt_tokens / 1000) * costs.inputPer1kTokens) +
               ((usage.completion_tokens / 1000) * costs.outputPer1kTokens)
      }
    };
  }
  
  async *completeStream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncGenerator<string, CompletionResponse> {
    // Streaming implementation
  }
  
  async countTokens(text: string): Promise<number> {
    // Use tiktoken for accurate counting
    return Math.ceil(text.length / 4);
  }
  
  getDefaultModel(): string {
    return 'gpt-4o';
  }
  
  validateModel(model: string): boolean {
    return this.models.includes(model);
  }
  
  private convertTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }
}

export { OpenAIProvider };
```

---

## Configuration Schema

### Tenant Model Preferences (Database)

```sql
-- Add to existing tenants table or create new table
CREATE TABLE tenant_model_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  
  -- Routing strategy
  strategy TEXT DEFAULT 'balanced' CHECK (strategy IN ('quality', 'balanced', 'cost', 'speed')),
  
  -- Provider preferences (JSON arrays)
  preferred_providers TEXT DEFAULT '["anthropic", "openai", "deepseek"]',
  blocked_providers TEXT DEFAULT '[]',
  
  -- Agent-specific overrides (JSON object)
  model_overrides TEXT DEFAULT '{}',
  
  -- Budget controls
  max_cost_per_request REAL,
  monthly_budget_limit REAL,
  current_monthly_spend REAL DEFAULT 0,
  
  -- Feature flags
  require_tool_calling INTEGER DEFAULT 0,
  allow_self_hosted INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Track usage per provider for billing
CREATE TABLE provider_usage (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  
  agent_type TEXT,
  ticket_id TEXT,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_usage_tenant ON provider_usage(tenant_id, created_at);
CREATE INDEX idx_provider_usage_billing ON provider_usage(tenant_id, provider, created_at);
```

### Environment Configuration

```bash
# /opt/swarm/.env

# Provider API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Default provider (fallback when tenant has no preference)
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-20250514

# Self-hosted Ollama (optional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_ENABLED=false

# Provider health check interval (seconds)
PROVIDER_HEALTH_CHECK_INTERVAL=60

# Cost tracking
ENABLE_COST_TRACKING=true
COST_ALERT_THRESHOLD_USD=100
```

---

## Migration Path

### Phase 1: Abstraction Layer (Week 1-2)

1. Create provider interfaces and types
2. Implement AnthropicProvider adapter
3. Refactor existing Claude calls to use adapter
4. Add provider registry initialization
5. Deploy with single provider (no behavior change)

### Phase 2: OpenAI Support (Week 3)

1. Implement OpenAIProvider adapter
2. Add tenant preference table to database
3. Create API endpoints for preference management
4. Add model selection to dashboard
5. Test with pilot customers

### Phase 3: DeepSeek + Cost Optimization (Week 4)

1. Implement DeepSeekProvider adapter
2. Add cost tracking to provider_usage table
3. Implement routing rules engine
4. Add cost dashboard for tenants
5. Offer "cost-optimized" tier

### Phase 4: Self-Hosted + Enterprise (Week 5-6)

1. Implement OllamaProvider adapter
2. Add air-gapped deployment documentation
3. Implement budget controls and alerts
4. Add compliance logging
5. SOC2 preparation documentation

---

## API Endpoints

```typescript
// Tenant preference management

// GET /api/v1/tenants/:tenantId/model-preferences
// Returns current model preferences

// PUT /api/v1/tenants/:tenantId/model-preferences
// Update model preferences
{
  "strategy": "balanced",
  "preferredProviders": ["anthropic", "deepseek"],
  "blockedProviders": ["openai"],
  "modelOverrides": {
    "design": "anthropic:claude-sonnet-4",
    "worker": "deepseek:deepseek-chat"
  },
  "maxCostPerRequest": 0.50,
  "monthlyBudgetLimit": 1000.00
}

// GET /api/v1/tenants/:tenantId/provider-usage
// Returns usage statistics
{
  "currentMonth": {
    "totalCost": 245.67,
    "byProvider": {
      "anthropic": { "requests": 1234, "cost": 180.50 },
      "deepseek": { "requests": 5678, "cost": 65.17 }
    },
    "byAgentType": {
      "design": { "requests": 100, "cost": 45.00 },
      "worker": { "requests": 6000, "cost": 150.00 }
    }
  },
  "budgetRemaining": 754.33
}

// GET /api/v1/providers
// List available providers and their status
{
  "providers": [
    {
      "name": "anthropic",
      "displayName": "Anthropic Claude",
      "status": "healthy",
      "models": ["claude-sonnet-4", "claude-opus-4", "claude-haiku"],
      "capabilities": { ... }
    }
  ]
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('ModelRouter', () => {
  it('should select Claude for design agents by default', async () => {
    const router = new ModelRouter(registry);
    const result = await router.selectModel('design');
    expect(result.provider.name).toBe('anthropic');
  });
  
  it('should select DeepSeek for worker agents with cost strategy', async () => {
    const router = new ModelRouter(registry, { strategy: 'cost' });
    const result = await router.selectModel('worker');
    expect(result.provider.name).toBe('deepseek');
  });
  
  it('should respect tenant blocked providers', async () => {
    const router = new ModelRouter(registry, { 
      blockedProviders: ['anthropic'] 
    });
    const result = await router.selectModel('design');
    expect(result.provider.name).not.toBe('anthropic');
  });
  
  it('should fallback when primary provider is down', async () => {
    // Mock anthropic health check to fail
    const fallbacks = router.getFallbackChain('anthropic:claude-sonnet-4');
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks[0]).not.toContain('anthropic');
  });
});
```

### Integration Tests

```typescript
describe('Provider Integration', () => {
  it('should complete request with Anthropic', async () => {
    const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
    const response = await provider.complete([
      { role: 'user', content: 'Say hello' }
    ], {});
    expect(response.content).toBeTruthy();
    expect(response.cost.total).toBeGreaterThan(0);
  });
  
  it('should complete request with DeepSeek', async () => {
    const provider = new DeepSeekProvider(process.env.DEEPSEEK_API_KEY!);
    const response = await provider.complete([
      { role: 'user', content: 'Say hello' }
    ], {});
    expect(response.content).toBeTruthy();
    // DeepSeek should be cheaper
    expect(response.cost.total).toBeLessThan(0.001);
  });
});
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cost reduction | 50% for worker agents | Compare pre/post DeepSeek adoption |
| Latency | <2s p95 for completions | Monitor per-provider latency |
| Availability | 99.9% with failover | Track failover events |
| Adoption | 30% tenants use multi-model | Dashboard analytics |
| Customer satisfaction | NPS > 40 | Post-feature survey |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider API changes | High | Version pin SDKs, adapter pattern isolates changes |
| Cost tracking accuracy | Medium | Reconcile with provider invoices monthly |
| Quality degradation with cheaper models | High | A/B test, allow tenant override to quality tier |
| Increased complexity | Medium | Comprehensive logging, clear defaults |
| Security of multiple API keys | High | Use secrets manager, rotate regularly |

---

## Appendix: Cost Comparison Table

| Model | Input ($/1M) | Output ($/1M) | Context | Speed | Quality |
|-------|--------------|---------------|---------|-------|---------|
| Claude Sonnet 4 | $3.00 | $15.00 | 200K | Medium | ⭐⭐⭐⭐⭐ |
| Claude Opus 4 | $15.00 | $75.00 | 200K | Slow | ⭐⭐⭐⭐⭐ |
| GPT-4o | $2.50 | $10.00 | 128K | Fast | ⭐⭐⭐⭐⭐ |
| GPT-4o-mini | $0.15 | $0.60 | 128K | Fast | ⭐⭐⭐⭐ |
| DeepSeek-V3 | $0.27 | $1.10 | 128K | Fast | ⭐⭐⭐⭐ |
| DeepSeek-R1 | $0.55 | $2.20 | 128K | Medium | ⭐⭐⭐⭐⭐ |
| Codestral | $0.30 | $0.90 | 256K | Very Fast | ⭐⭐⭐⭐ |
| Ollama (local) | $0 | $0 | Varies | Varies | ⭐⭐⭐ |

**Key Insight:** DeepSeek-V3 offers ~90% of Claude quality at ~7% of the cost. For routine worker agent tasks, this is a 14x cost reduction.
