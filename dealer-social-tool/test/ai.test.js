// Exercises the Claude integration against a local fake Messages API.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
// Chat-loop replies, set per test.
let responder = () => ({});
// Structured-output (copywriter) replies: one variant per requested platform unless a test overrides it.
let copyVariants = null;
const copywriter = (body) => {
  const platforms = body.messages[0].content.match(/platforms: (.*)\./)[1].split(', ');
  const variants = copyVariants ?? platforms.map((platform) => ({ platform, title: 'AI', content: `AI copy for ${platform}`, hashtags: ['#AI'], image_idea: '' }));
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ variants }) }] };
};
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    requests.push({ headers: req.headers, body: parsed });
    const chatCalls = requests.filter((r) => !r.body.output_config?.format).length;
    const reply = parsed.output_config?.format ? copywriter(parsed) : responder(parsed, chatCalls);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_${requests.length}`,
        type: 'message',
        role: 'assistant',
        model: parsed.model,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
        ...reply,
      }),
    );
  });
});

let mods;
before(async () => {
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  mods = {
    helpers: await import('./helpers.js'),
    agent: await import('../src/ai/agent.js'),
    generator: await import('../src/ai/generator.js'),
    posts: await import('../src/services/posts.js'),
  };
});
after(() => server.close());
beforeEach(() => {
  requests.length = 0;
  copyVariants = null;
  mods.helpers.setupDb();
});

test('generator sends a structured-output request with fallbacks and fills missing platforms', async () => {
  copyVariants = [{ platform: 'facebook', title: 'T', content: 'Meet the F-150!', hashtags: ['Ford'], image_idea: 'truck at sunset' }];
  const { getVehicle } = await import('../src/services/inventory.js');
  const res = await mods.generator.generatePostVariants({ postType: 'vehicle_spotlight', vehicle: getVehicle(1), platforms: ['facebook', 'x'] });
  assert.equal(res.engine, 'claude');
  assert.equal(res.variants[0].content, 'Meet the F-150!');
  assert.deepEqual(res.variants[0].hashtags, ['#Ford']);
  assert.equal(res.variants[1].platform, 'x', 'missing platform falls back to a template');

  const { body, headers } = requests[0];
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.thinking, undefined);
});

test('the bot runs tools, keeps append-only history, and respects assist mode', async () => {
  responder = (body, n) => {
    if (n === 1) {
      return {
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: 'Let me check and write that.' },
          { type: 'tool_use', id: 'tu_1', name: 'get_overview', input: {} },
          { type: 'tool_use', id: 'tu_2', name: 'generate_posts', input: { post_type: 'new_arrival', platforms: ['facebook', 'instagram'], vehicle_id: 1 } },
          { type: 'tool_use', id: 'tu_3', name: 'publish_post_now', input: { post_id: 1 } },
        ],
      };
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Drafted 2 posts for your approval.' }] };
  };

  const result = await mods.agent.chat('conv-1', 'Post our new F-150');
  assert.match(result.reply, /Drafted 2 posts/);
  assert.deepEqual(result.actions.map((a) => [a.tool, a.ok]), [
    ['get_overview', true],
    ['generate_posts', true],
    ['publish_post_now', false],
  ]);
  assert.equal(mods.posts.listPosts({ status: 'pending_approval' }).length, 2);

  const second = requests.find((r, i) => i > 0 && !r.body.output_config?.format).body;
  assert.ok(second.tools.every((t) => t.input_schema?.type === 'object'));
  assert.equal(second.messages[1].content[0].type, 'thinking', 'assistant turn is replayed unchanged');
  const results = second.messages[2].content;
  assert.equal(results.length, 3, 'all tool results go back in one user message');
  assert.equal(results[2].is_error, true);
  assert.match(results[2].content, /human approval/);

  const transcript = mods.agent.conversationTranscript('conv-1');
  assert.equal(transcript[0].text, 'Post our new F-150');
  assert.equal(transcript.length, 2);

  // A follow-up message replays the full stored history.
  await mods.agent.chat('conv-1', 'Thanks');
  assert.equal(requests.at(-1).body.messages.length, 5);
});

test('invalid tool input is reported back to the model instead of crashing', async () => {
  responder = (body, n) =>
    n === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'schedule_post', input: { post_id: 'abc' } }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry about that.' }] };
  const result = await mods.agent.chat('conv-2', 'schedule it');
  assert.equal(result.actions[0].ok, false);
  assert.match(requests[1].body.messages.at(-1).content[0].content, /Invalid input/);
});
