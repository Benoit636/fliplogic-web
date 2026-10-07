import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { getDealership } from '../services/dealership.js';
import { aiEnabled, getClient, baseParams, assertNotRefused } from './client.js';
import { dealershipBrief } from './prompts.js';

const Triage = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  intent: z.enum(['lead', 'question', 'complaint', 'praise', 'spam', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  is_lead: z.boolean(),
  suggested_reply: z.string(),
});

const TRIAGE_RULES = `You manage the social media inbox for a car dealership. For each incoming comment, DM or review:
- Classify sentiment and intent. A "lead" is anyone showing buying, trade-in, financing, test-drive or pricing interest.
- Priority: urgent = angry customer or safety issue; high = hot lead or unresolved complaint; normal = questions; low = praise/chit-chat/spam.
- Draft a short, warm, human reply in the dealership's voice (public-comment appropriate: never share personal data,
  never quote payments/APR/trade values, move pricing & complaints to DM or phone). For spam, suggested_reply is "".
- Reviews: thank positive reviewers by name; for negative ones apologise, take it offline, give the phone number.`;

export async function triageMessage(message, context = '') {
  const dealer = getDealership();
  if (!aiEnabled()) return fallbackTriage(message, dealer);
  const response = await getClient().beta.messages.parse({
    ...baseParams('low'),
    max_tokens: 4000,
    system: [
      { type: 'text', text: TRIAGE_RULES },
      { type: 'text', text: dealershipBrief(dealer), cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: [
          `Platform: ${message.platform}`,
          `Type: ${message.kind}${message.rating ? ` (${message.rating}★)` : ''}`,
          `From: ${message.author}`,
          context && `In reply to our post: ${context}`,
          `Message: ${message.text}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    output_config: { ...baseParams('low').output_config, format: betaZodOutputFormat(Triage) },
  });
  assertNotRefused(response);
  return response.parsed_output ?? fallbackTriage(message, dealer);
}

// Keyword triage used without an API key.
export function fallbackTriage(message, dealer) {
  const t = message.text.toLowerCase();
  const has = (...words) => words.some((w) => t.includes(w));
  const firstName = (message.author || '').split(/\s+/)[0] || 'there';
  const phone = dealer.phone ? ` at ${dealer.phone}` : '';

  if (has('http://', 'https://', 'crypto', 'follow for follow', 'dm me for', 'giveaway winner')) {
    return { sentiment: 'neutral', intent: 'spam', priority: 'low', is_lead: false, suggested_reply: '' };
  }
  const negative =
    has('terrible', 'worst', 'rude', 'scam', 'never again', 'awful', 'disappointed', 'problem', 'broken', 'angry') || (message.rating && message.rating <= 2);
  if (negative) {
    return {
      sentiment: 'negative',
      intent: 'complaint',
      priority: has('unsafe', 'brake', 'accident', 'lawyer') ? 'urgent' : 'high',
      is_lead: false,
      suggested_reply: `Hi ${firstName}, we're really sorry to hear this. We'd like to make it right — please send us a DM or call us${phone} so a manager can help personally.`,
    };
  }
  if (has('price', 'available', 'still for sale', 'trade', 'financ', 'lease', 'test drive', 'how much', 'interested', 'payment')) {
    return {
      sentiment: 'positive',
      intent: 'lead',
      priority: 'high',
      is_lead: true,
      suggested_reply: `Hi ${firstName}! Thanks for reaching out — we'd love to help. We just sent you a DM with the details, or call us${phone} to book a test drive.`,
    };
  }
  if (t.includes('?')) {
    return {
      sentiment: 'neutral',
      intent: 'question',
      priority: 'normal',
      is_lead: false,
      suggested_reply: `Great question, ${firstName}! Send us a DM or call${phone} and our team will get you an answer right away.`,
    };
  }
  if (has('love', 'great', 'awesome', 'thank', 'amazing', 'best', 'beautiful', '🔥', '😍') || (message.rating && message.rating >= 4)) {
    return {
      sentiment: 'positive',
      intent: 'praise',
      priority: 'low',
      is_lead: false,
      suggested_reply: `Thank you so much, ${firstName}! We appreciate you. 🙌`,
    };
  }
  return { sentiment: 'neutral', intent: 'other', priority: 'low', is_lead: false, suggested_reply: `Thanks for the comment, ${firstName}!` };
}
