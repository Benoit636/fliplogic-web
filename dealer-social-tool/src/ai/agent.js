// "Dealer Social" bot: a conversational agent that runs the dealership's social media with tools.
import { all, run, parseJson, logActivity } from '../db.js';
import { POST_TYPES } from '../config.js';
import { aiEnabled, getClient, baseParams, AiRefusalError } from './client.js';
import { TOOL_DEFINITIONS, executeTool, PLATFORM_LIST } from './tools.js';

const MAX_TURNS = 15;

const SYSTEM_PROMPT = `You are "Dealer Social", the AI social media manager for a car dealership. You plan, write, schedule,
publish and monitor the dealership's posts, handle its inbox, and report on results — using your tools.

How you work:
- Start a new conversation by calling get_overview so you know the dealership, its voice, connected accounts and autonomy mode.
- Assist mode: everything you create goes to the human approval queue. Say so plainly and tell the user where to approve.
  Autopilot mode: you may schedule, publish and reply on your own, but still escalate complaints and hot leads to a human.
- Base every vehicle post on real inventory from search_inventory. Never invent prices, incentives, payments or features.
- Prefer a steady mix: vehicle spotlights, new arrivals, price drops, sold celebrations, service tips, reviews, community content.
  Avoid featuring the same vehicle twice in a week.
- Good default posting windows (local time): Facebook 9–11am and 6–8pm, Instagram 11am–1pm and 7–9pm, TikTok 7–10pm,
  LinkedIn weekdays 8–10am, Google Business any weekday morning, X mid-day.
- When you schedule, use ISO 8601 times with the local offset given in the user's message header.
- After acting, reply with a short summary: what you did, post IDs, what needs the user's approval, and one useful next step.
  Keep replies concise and skimmable; use short bullet lists when listing posts.

Platforms: ${PLATFORM_LIST}.
Post types: ${Object.entries(POST_TYPES).map(([k, v]) => `${k} (${v})`).join(', ')}.`;

function timeHeader(now = new Date()) {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  const local = now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `[Current local time: ${local} (UTC offset ${offset})]`;
}

function loadHistory(conversationId) {
  return all('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id', conversationId).map((r) => ({
    role: r.role,
    content: parseJson(r.content, r.content),
  }));
}

function save(conversationId, role, content) {
  run('INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)', conversationId, role, JSON.stringify(content));
}

/** Messages as the UI shows them: user text + assistant text, with the tools the bot used. */
export function conversationTranscript(conversationId) {
  const out = [];
  for (const m of loadHistory(conversationId)) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'user') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text.replace(/^\[Current local time:[^\]]*\]\n?/, '')).join('\n');
      if (text) out.push({ role: 'user', text });
    } else {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const tools = blocks.filter((b) => b.type === 'tool_use').map((b) => b.name);
      const last = out[out.length - 1];
      if (last?.role === 'assistant') {
        last.text = [last.text, text].filter(Boolean).join('\n\n');
        last.tools.push(...tools);
      } else out.push({ role: 'assistant', text, tools });
    }
  }
  return out;
}

export async function chat(conversationId, userText) {
  if (!aiEnabled()) {
    return {
      reply:
        'The AI bot needs a Claude API key. Add ANTHROPIC_API_KEY to your .env file and restart the server. Everything else in Dealer Social (templates, scheduling, inbox, analytics) keeps working without it.',
      actions: [],
    };
  }

  // History is append-only so earlier turns (including thinking blocks) are replayed exactly as returned.
  const messages = loadHistory(conversationId);
  const userMessage = { role: 'user', content: [{ type: 'text', text: `${timeHeader()}\n${userText}` }] };
  messages.push(userMessage);
  save(conversationId, 'user', userMessage.content);

  const actions = [];
  const replyParts = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await getClient().beta.messages.create({
      ...baseParams('medium'),
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new AiRefusalError(response.stop_details?.explanation || 'The AI declined this request');
    }
    messages.push({ role: 'assistant', content: response.content });
    save(conversationId, 'assistant', response.content);
    for (const b of response.content) if (b.type === 'text' && b.text.trim()) replyParts.push(b.text.trim());

    if (response.stop_reason === 'pause_turn') continue;
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break;

    const results = [];
    for (const call of toolUses) {
      const outcome = await executeTool(call.name, call.input);
      actions.push({ tool: call.name, ok: outcome.ok, error: outcome.error });
      if (call.name !== 'get_overview' && call.name.match(/^(generate|edit|schedule|publish|delete|reply|save|update)/)) {
        logActivity('bot', `bot.${call.name}`, outcome.ok ? 'ok' : outcome.error);
      }
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
        is_error: !outcome.ok,
      });
    }
    messages.push({ role: 'user', content: results });
    save(conversationId, 'user', results);
  }

  return { reply: replyParts.join('\n\n') || 'Done.', actions };
}
