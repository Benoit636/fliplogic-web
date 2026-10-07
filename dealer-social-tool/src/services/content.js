import crypto from 'node:crypto';
import { generatePostVariants } from '../ai/generator.js';
import { logActivity } from '../db.js';
import { isAutopilot } from './dealership.js';
import { getVehicle, markVehiclePosted, markSoldCelebrated, vehicleTitle } from './inventory.js';
import { createPost } from './posts.js';
import { httpError } from './errors.js';
import { consumeAiPosts, addUsage } from './entitlements.js';
import { OBJECTIVE_BY_KEY, vehicleName } from '../shared/objectives.js';

/**
 * Turn one idea into a batch of platform-specific posts.
 * Bot-created posts go to the approval queue unless the dealership runs on autopilot.
 */
export async function createPostsFromIdea({
  postType,
  vehicleId = null,
  platforms,
  instructions = '',
  scheduledAt = null,
  media = null,
  details = null,
  actor = 'user',
  source = 'ai',
}) {
  const vehicle = vehicleId ? getVehicle(Number(vehicleId)) : null;
  if (vehicleId && !vehicle) throw httpError(404, `Vehicle ${vehicleId} not found`);

  const reserved = new Set(platforms).size || 1;
  consumeAiPosts(reserved);
  let generated;
  try {
    generated = await generatePostVariants({ postType, vehicle, details, platforms, instructions });
  } catch (err) {
    addUsage('ai_posts', -reserved); // don't charge the allowance for a failed generation
    throw err;
  }
  const { engine, variants } = generated;
  const objective = OBJECTIVE_BY_KEY[postType];
  const brief = objective ? { condition: objective.condition, objective: postType, details: generated.details } : {};
  const batchId = crypto.randomUUID();
  const autoPublish = actor !== 'user' && isAutopilot() && scheduledAt;
  const status = actor === 'user' ? 'draft' : autoPublish ? 'scheduled' : 'pending_approval';

  const posts = variants.map((v) =>
    createPost(
      {
        ...v,
        post_type: postType,
        media: media ?? (vehicle?.photos || []).slice(0, 4),
        vehicle_id: vehicle?.id,
        status,
        source,
        batch_id: batchId,
        scheduled_at: scheduledAt,
        brief,
      },
      actor,
    ),
  );

  if (vehicle) {
    markVehiclePosted(vehicle.id);
    if (postType === 'sold_celebration') markSoldCelebrated(vehicle.id);
  }
  const subject = vehicle ? vehicleTitle(vehicle) : objective ? vehicleName(generated.details) : '';
  logActivity(actor, 'content.generated', `${posts.length} ${postType} post(s)${subject ? ` for ${subject}` : ''} via ${engine}`);
  return { engine, batch_id: batchId, posts };
}
