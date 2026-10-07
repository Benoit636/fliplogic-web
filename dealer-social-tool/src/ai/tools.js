// Tools the AI bot can use to run the dealership's social media.
import { z } from 'zod';
import { PLATFORM_KEYS, POST_TYPE_KEYS, PLATFORMS } from '../config.js';
import { get, run } from '../db.js';
import { tenantId } from '../tenant.js';
import { getDealership, isAutopilot } from '../services/dealership.js';
import { listAccounts } from '../services/accounts.js';
import { listVehicles, updateVehicle, vehicleTitle } from '../services/inventory.js';
import { createPostsFromIdea } from '../services/content.js';
import { listPosts, getPost, updatePost, schedulePost, deletePost, statusCounts } from '../services/posts.js';
import { publishPost } from '../services/publisher.js';
import { listMessages, replyToMessage, inboxCounts, getMessage } from '../services/inbox.js';
import { analyticsSummary } from '../services/analytics.js';
import { listRules, createRule, updateRule } from '../services/autopilot.js';

const platformEnum = z.enum(PLATFORM_KEYS);
const postTypeEnum = z.enum(POST_TYPE_KEYS);

const brief = (p) => ({
  id: p.id,
  platform: p.platform,
  type: p.post_type,
  status: p.status,
  scheduled_at: p.scheduled_at,
  published_at: p.published_at,
  vehicle_id: p.vehicle_id,
  content: p.content,
  hashtags: p.hashtags,
  has_media: p.media.length > 0,
  warnings: p.warnings,
  metrics: p.status === 'published' ? p.metrics : undefined,
  error: p.error || undefined,
});

const TOOLS = [
  {
    name: 'get_overview',
    description:
      'Get the dealership profile, autonomy mode (assist = humans approve everything, autopilot = the bot may publish and reply), connected social accounts, post counts by status and inbox counts. Call this first in a new conversation.',
    schema: z.object({}),
    run: () => {
      const d = getDealership();
      return {
        dealership: { name: d.name, brands: d.brands, city: d.city, phone: d.phone, website: d.website, brand_voice: d.brand_voice, autonomy: d.autonomy },
        accounts: listAccounts().map((a) => ({ platform: a.platform, name: a.display_name, mode: a.mode, enabled: a.enabled })),
        posts_by_status: statusCounts(),
        inbox: inboxCounts(),
        inventory: get(
          `SELECT SUM(status='available') AS available, SUM(status='sold') AS sold, COUNT(*) AS total FROM vehicles WHERE dealership_id = ?`,
          tenantId(),
        ),
      };
    },
  },
  {
    name: 'search_inventory',
    description: 'Search the vehicle inventory. Returns id, title, price, mileage, status, when it was last featured, and how many photos it has.',
    schema: z.object({
      query: z.string().optional().describe('Free text, e.g. "F-150", "2022 Civic", a stock number'),
      status: z.enum(['available', 'pending', 'sold']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: ({ query, status, limit = 25 }) =>
      listVehicles({ q: query, status, limit }).map((v) => ({
        id: v.id,
        title: vehicleTitle(v),
        condition: v.condition,
        price: v.price,
        previous_price: v.previous_price,
        mileage: v.mileage,
        color: v.exterior_color,
        features: v.features,
        status: v.status,
        photos: v.photos.length,
        last_featured: v.last_posted_at,
        stock_number: v.stock_number,
      })),
  },
  {
    name: 'update_vehicle',
    description: 'Update a vehicle: mark it sold/pending/available or change its price (a lower price enables a price-drop post).',
    schema: z.object({
      vehicle_id: z.number().int(),
      status: z.enum(['available', 'pending', 'sold']).optional(),
      price: z.number().positive().optional(),
    }),
    run: ({ vehicle_id, ...patch }) => {
      const v = updateVehicle(vehicle_id, patch);
      return { id: v.id, title: vehicleTitle(v), status: v.status, price: v.price };
    },
  },
  {
    name: 'generate_posts',
    description:
      'Write new posts (one per platform) for a single idea using the dealership voice, and save them. In assist mode they go to the approval queue; in autopilot mode they are scheduled when scheduled_at is given. Use vehicle_id for vehicle-related post types.',
    schema: z.object({
      post_type: postTypeEnum,
      platforms: z.array(platformEnum).min(1),
      vehicle_id: z.number().int().optional(),
      instructions: z.string().optional().describe('Angle, offer details, event date, tone, etc.'),
      scheduled_at: z.string().optional().describe('ISO 8601 date-time with offset for when it should go out'),
    }),
    run: async ({ post_type, platforms, vehicle_id, instructions, scheduled_at }) => {
      const res = await createPostsFromIdea({
        postType: post_type,
        platforms,
        vehicleId: vehicle_id,
        instructions,
        scheduledAt: scheduled_at,
        actor: 'bot',
      });
      return { written_by: res.engine, posts: res.posts.map(brief) };
    },
  },
  {
    name: 'list_posts',
    description:
      'List posts, newest first. Filter by status (comma separated: draft,pending_approval,approved,scheduled,published,failed,rejected), platform, or date range.',
    schema: z.object({
      status: z.string().optional(),
      platform: platformEnum.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: ({ limit = 20, ...filters }) => listPosts({ ...filters, limit }).map(brief),
  },
  {
    name: 'edit_post',
    description: 'Change the text, hashtags or planned time of a post that has not been published yet.',
    schema: z.object({
      post_id: z.number().int(),
      content: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      scheduled_at: z.string().optional(),
    }),
    run: ({ post_id, ...patch }) => brief(updatePost(post_id, patch, 'bot')),
  },
  {
    name: 'schedule_post',
    description: 'Put a post on the calendar at a time. In assist mode the post waits for human approval before it can go out.',
    schema: z.object({ post_id: z.number().int(), scheduled_at: z.string() }),
    run: ({ post_id, scheduled_at }) => brief(schedulePost(post_id, scheduled_at, { actor: 'bot', autopilot: isAutopilot() })),
  },
  {
    name: 'publish_post_now',
    description: 'Publish a post immediately. Works for posts a human already approved, or any post when the dealership is in autopilot mode.',
    schema: z.object({ post_id: z.number().int() }),
    run: async ({ post_id }) => {
      const post = getPost(post_id);
      if (!post) throw new Error('Post not found');
      if (!isAutopilot() && !['approved', 'scheduled'].includes(post.status)) {
        throw new Error('This post needs human approval first (assist mode). Ask the user to approve it in the Approvals tab.');
      }
      if (!['approved', 'scheduled'].includes(post.status)) {
        run(`UPDATE posts SET status = 'approved' WHERE id = ? AND dealership_id = ?`, post_id, tenantId());
      }
      return brief(await publishPost(post_id, 'bot'));
    },
  },
  {
    name: 'delete_post',
    description: 'Delete a post that is not published yet.',
    schema: z.object({ post_id: z.number().int() }),
    run: ({ post_id }) => {
      deletePost(post_id, 'bot');
      return { deleted: post_id };
    },
  },
  {
    name: 'list_inbox',
    description: 'Read comments, DMs and reviews with the bot triage (sentiment, intent, priority, lead flag, suggested reply).',
    schema: z.object({
      status: z.enum(['new', 'replied', 'dismissed', 'escalated']).optional(),
      leads_only: z.boolean().optional(),
    }),
    run: ({ status, leads_only }) =>
      listMessages({ status, lead: leads_only })
        .slice(0, 40)
        .map((m) => ({
          id: m.id,
          platform: m.platform,
          kind: m.kind,
          author: m.author,
          text: m.text,
          rating: m.rating,
          intent: m.intent,
          sentiment: m.sentiment,
          priority: m.priority,
          is_lead: m.is_lead,
          status: m.status,
          suggested_reply: m.suggested_reply,
          reply: m.reply,
        })),
  },
  {
    name: 'reply_to_message',
    description: 'Reply to a comment/DM/review. In autopilot mode the reply is sent. In assist mode it is saved as the suggested reply for a human to send.',
    schema: z.object({ message_id: z.number().int(), text: z.string().min(1) }),
    run: async ({ message_id, text }) => {
      if (!getMessage(message_id)) throw new Error('Message not found');
      if (!isAutopilot()) {
        run('UPDATE inbox_messages SET suggested_reply = ? WHERE id = ? AND dealership_id = ?', text, message_id, tenantId());
        return { sent: false, saved_as_suggestion: true };
      }
      const m = await replyToMessage(message_id, text, 'bot');
      return { sent: true, status: m.status };
    },
  },
  {
    name: 'get_analytics',
    description: 'Performance summary for the last N days: totals, per platform, per post type, daily series and top posts.',
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    run: ({ days = 30 }) => {
      const s = analyticsSummary(days);
      return { ...s, series: s.series.filter((d) => d.posts > 0) };
    },
  },
  {
    name: 'list_autopilot_rules',
    description: 'List the recurring autopilot rules that make the bot create posts on a schedule.',
    schema: z.object({}),
    run: () => listRules(),
  },
  {
    name: 'save_autopilot_rule',
    description:
      'Create a recurring rule (omit rule_id) or update one (give rule_id). days_of_week: 0=Sunday … 6=Saturday. time_of_day is 24h HH:MM in the dealership local time. Vehicle post types pick the right vehicle automatically each run.',
    schema: z.object({
      rule_id: z.number().int().optional(),
      name: z.string().optional(),
      post_type: postTypeEnum.optional(),
      platforms: z.array(platformEnum).min(1).optional(),
      days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
      time_of_day: z.string().optional(),
      instructions: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    run: ({ rule_id, ...fields }) => (rule_id ? updateRule(rule_id, fields, 'bot') : createRule(fields, 'bot')),
  },
];

export const TOOL_DEFINITIONS = TOOLS.map((t) => {
  const { $schema, ...input_schema } = z.toJSONSchema(t.schema);
  return { name: t.name, description: t.description, input_schema };
});

/** Run a tool call; returns { ok, result } or { ok: false, error }. Never throws. */
export async function executeTool(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool ${name}` };
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.message}` };
  try {
    return { ok: true, result: await tool.run(parsed.data) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const PLATFORM_LIST = Object.entries(PLATFORMS)
  .map(([k, p]) => `${k} = ${p.label}`)
  .join(', ');
