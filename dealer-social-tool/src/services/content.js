import crypto from 'node:crypto';
import { generatePostVariants } from '../ai/generator.js';
import { logActivity } from '../db.js';
import { isAutopilot } from './dealership.js';
import { getVehicle, markVehiclePosted, markSoldCelebrated, vehicleTitle } from './inventory.js';
import { createPost } from './posts.js';
import { httpError } from './errors.js';

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
  actor = 'user',
  source = 'ai',
}) {
  const vehicle = vehicleId ? getVehicle(Number(vehicleId)) : null;
  if (vehicleId && !vehicle) throw httpError(404, `Vehicle ${vehicleId} not found`);

  const { engine, variants } = await generatePostVariants({ postType, vehicle, platforms, instructions });
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
      },
      actor,
    ),
  );

  if (vehicle) {
    markVehiclePosted(vehicle.id);
    if (postType === 'sold_celebration') markSoldCelebrated(vehicle.id);
  }
  logActivity(actor, 'content.generated', `${posts.length} ${postType} post(s)${vehicle ? ` for ${vehicleTitle(vehicle)}` : ''} via ${engine}`);
  return { engine, batch_id: batchId, posts };
}
