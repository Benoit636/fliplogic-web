// Vehicle photos uploaded from the Create Post flow (usually straight from a phone).
// Files are stored per dealership and served publicly at /media/... because Facebook and
// Instagram fetch the image from that address when a post is published.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { tenantId } from '../tenant.js';
import { httpError } from './errors.js';

const SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Save an uploaded photo; returns its site-relative URL ("/media/<dealership>/<file>"). */
export function savePhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) throw httpError(400, 'Upload a JPG, PNG or WebP photo');
  if (buffer.length > MAX_PHOTO_BYTES) throw httpError(413, 'Photos must be under 10 MB');
  // Trust the file's bytes, not its name or content type.
  const type = SIGNATURES.find((s) => s.test(buffer));
  if (!type) throw httpError(400, 'That file is not a JPG, PNG or WebP photo');
  const dir = path.join(config.mediaDir, String(tenantId()));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomToken(16)}.${type.ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return { url: `/media/${tenantId()}/${name}` };
}

/** Social networks need full addresses; posts store site-relative ones. */
export const absoluteMediaUrl = (url) => (url.startsWith('/') ? `${config.appUrl}${url}` : url);

/** Keep only photo references we accept on a post. */
export function cleanMediaList(list) {
  if (!Array.isArray(list)) return null;
  return list.filter((u) => typeof u === 'string' && (/^\/media\/\d+\/[\w-]+\.(jpg|png|webp)$/.test(u) || /^https?:\/\//i.test(u))).slice(0, 10);
}
