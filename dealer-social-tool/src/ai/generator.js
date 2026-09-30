import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PLATFORM_KEYS, POST_TYPE_KEYS, VEHICLE_POST_TYPES } from '../config.js';
import { getDealership } from '../services/dealership.js';
import { aiEnabled, getClient, baseParams, assertNotRefused } from './client.js';
import { COPYWRITER_RULES, dealershipBrief, postRequest } from './prompts.js';
import { fallbackPost } from './fallback.js';

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

/**
 * Write platform-tailored copy for one post idea.
 * Returns one variant per requested platform plus which engine wrote it.
 */
export async function generatePostVariants({ postType, vehicle = null, platforms, instructions = '' }) {
  if (!POST_TYPE_KEYS.includes(postType)) throw Object.assign(new Error(`Unknown post type ${postType}`), { status: 400 });
  const wanted = [...new Set(platforms)].filter((p) => PLATFORM_KEYS.includes(p));
  if (!wanted.length) throw Object.assign(new Error('Pick at least one platform'), { status: 400 });
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
      messages: [{ role: 'user', content: postRequest({ postType, vehicle, platforms: wanted, instructions, unit: dealer.distance_unit }) }],
      output_config: { ...baseParams('low').output_config, format: betaZodOutputFormat(PostVariants) },
    });
    assertNotRefused(response);
    variants = response.parsed_output?.variants ?? [];
    engine = 'claude';
  }

  const byPlatform = new Map(variants.filter((v) => wanted.includes(v.platform)).map((v) => [v.platform, v]));
  return {
    engine,
    variants: wanted.map((platform) => {
      const v = byPlatform.get(platform) || fallbackPost({ postType, vehicle, platform, instructions, dealer });
      return { ...v, hashtags: v.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)) };
    }),
  };
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
