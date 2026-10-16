import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PLATFORMS, PLATFORM_KEYS, POST_TYPE_KEYS, VEHICLE_POST_TYPES } from '../config.js';
import { getDealership } from '../services/dealership.js';
import { aiEnabled, getClient, baseParams, assertNotRefused } from './client.js';
import { COPYWRITER_RULES, dealershipBrief, postRequest, objectiveRequest } from './prompts.js';
import { fallbackPost } from './fallback.js';
import { OBJECTIVE_BY_KEY, missingFields, writeObjectivePost } from '../shared/objectives.js';
import { unverifiedClaims } from './claims.js';

const LINK_PLATFORMS = ['facebook', 'linkedin', 'x', 'google_business'];

const PostVariants = z.object({
  variants: z.array(
    z.object({
      platform: z.enum(PLATFORM_KEYS),
      title: z.string(),
      content: z.string(),
      hashtags: z.array(z.string()),
      image_idea: z.string(),
    }),
  ),
});

/** Vehicle record → objective details, so inventory vehicles can prefill a New/Used post. */
export function detailsFromVehicle(v) {
  if (!v) return {};
  const out = {};
  for (const k of ['year', 'make', 'model', 'trim', 'mileage', 'price', 'previous_price', 'stock_number', 'exterior_color', 'features', 'detail_url']) {
    if (v[k] != null && v[k] !== '') out[k] = String(v[k]);
  }
  return out;
}

/**
 * Write platform-tailored copy for one post idea.
 * Objective posts (the New/Used Create Post flow) are written from `details`;
 * older post types from an inventory `vehicle`.
 * Returns one variant per requested platform plus which engine wrote it.
 */
export async function generatePostVariants({ postType, vehicle = null, details = null, platforms, instructions = '', language = 'en' }) {
  const objective = OBJECTIVE_BY_KEY[postType];
  if (!POST_TYPE_KEYS.includes(postType)) throw Object.assign(new Error(`Unknown post type ${postType}`), { status: 400 });
  const wanted = [...new Set(platforms)].filter((p) => PLATFORM_KEYS.includes(p));
  if (!wanted.length) throw Object.assign(new Error('Pick at least one platform'), { status: 400 });
  const facts = objective ? { ...detailsFromVehicle(vehicle), ...stripEmpty(details) } : null;
  if (objective) {
    const missing = missingFields(postType, facts);
    if (missing.length) throw Object.assign(new Error(`Please add: ${missing.join(', ')}`), { status: 400 });
  }
  if (VEHICLE_POST_TYPES.includes(postType) && !vehicle) {
    throw Object.assign(new Error('Pick a vehicle for this type of post'), { status: 400 });
  }
  const dealer = getDealership();

  let variants = [];
  let engine = 'templates';
  if (aiEnabled()) {
    const response = await getClient().beta.messages.parse({
      ...baseParams('low'),
      max_tokens: 16000,
      system: [
        { type: 'text', text: COPYWRITER_RULES },
        { type: 'text', text: dealershipBrief(dealer), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: objective
            ? objectiveRequest({ objective, details: facts, platforms: wanted, unit: dealer.distance_unit, instructions, language })
            : postRequest({ postType, vehicle, platforms: wanted, instructions, unit: dealer.distance_unit }),
        },
      ],
      output_config: { ...baseParams('low').output_config, format: betaZodOutputFormat(PostVariants) },
    });
    assertNotRefused(response);
    variants = response.parsed_output?.variants ?? [];
    engine = 'claude';
  }

  // Fact guard: AI copy that states a price, discount, percentage or financing offer that isn't in the
  // vehicle data is thrown away and replaced by template copy written only from the facts.
  const known = facts || detailsFromVehicle(vehicle);
  const rejected = [];
  variants = variants.filter((v) => {
    const problems = unverifiedClaims(`${v.content} ${(v.hashtags || []).join(' ')}`, known, dealer);
    if (problems.length) rejected.push({ platform: v.platform, problems });
    return !problems.length;
  });
  const byPlatform = new Map(variants.filter((v) => wanted.includes(v.platform)).map((v) => [v.platform, v]));
  return {
    engine,
    fact_check: rejected,
    details: facts,
    variants: wanted.map((platform) => {
      const v =
        byPlatform.get(platform) ||
        (objective
          ? writeObjectivePost({ objectiveKey: postType, details: facts, dealer, platform, rules: PLATFORMS[platform], language })
          : fallbackPost({ postType, vehicle, platform, instructions, dealer }));
      // The vehicle's page on the dealership website, so people can see it (where links work in captions).
      const link = known?.detail_url && LINK_PLATFORMS.includes(platform) && !v.content.includes(known.detail_url) ? `\n\n🔗 ${known.detail_url}` : '';
      return { ...v, content: `${v.content}${link}`, platform, hashtags: v.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)) };
    }),
  };
}

function stripEmpty(obj) {
  return Object.fromEntries(
    Object.entries(obj || {})
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => [k, String(v).trim()]),
  );
}

const RewriteSchema = z.object({ content: z.string(), hashtags: z.array(z.string()) });

/** Rewrite an existing post following a short instruction ("shorter", "more fun", "add Spanish"). */
export async function rewritePost(post, instruction) {
  if (!aiEnabled()) throw Object.assign(new Error('Connect a Claude API key to use AI rewrite'), { status: 400 });
  const dealer = getDealership();
  const response = await getClient().beta.messages.parse({
    ...baseParams('low'),
    max_tokens: 8000,
    system: [
      { type: 'text', text: COPYWRITER_RULES },
      { type: 'text', text: dealershipBrief(dealer), cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `Rewrite this ${post.platform} post. Instruction: ${instruction}\n\nCurrent text:\n${post.content}\n\nCurrent hashtags: ${post.hashtags.join(' ')}`,
      },
    ],
    output_config: { ...baseParams('low').output_config, format: betaZodOutputFormat(RewriteSchema) },
  });
  assertNotRefused(response);
  if (!response.parsed_output) throw new Error('AI returned an unreadable rewrite');
  return response.parsed_output;
}
