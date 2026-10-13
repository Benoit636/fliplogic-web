import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client;

export function aiEnabled() {
  return !!(config.anthropicApiKey || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getClient() {
  if (!aiEnabled()) return null;
  if (!client) client = new Anthropic(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {});
  return client;
}

/**
 * Shared request settings. `fallbacks: "default"` lets the API re-run a request
 * that the primary model declines on Anthropic's recommended fallback model.
 */
export function baseParams(effort = 'medium') {
  const params = {
    model: config.aiModel,
    output_config: { effort },
  };
  if (process.env.AI_FALLBACKS !== 'off') {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

export class AiRefusalError extends Error {}

export function assertNotRefused(response) {
  if (response.stop_reason === 'refusal') {
    throw new AiRefusalError(response.stop_details?.explanation || 'The AI declined this request');
  }
}

export function textOf(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
