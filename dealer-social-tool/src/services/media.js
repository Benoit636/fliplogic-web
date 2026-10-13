// Vehicle photos uploaded from the Create Post flow (usually straight from a phone).
// Files are stored per dealership and served publicly at /media/... because Facebook and
// Instagram fetch the image from that address when a post is published.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { tenantId } from '../tenant.js';
import { httpError } from './errors.js';
import { get, run } from '../db.js';
import { assertPublicUrl } from '../net.js';

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
  if (!type && /^ftyp(heic|heix|hevc|mif1|msf1|avif)/.test(buffer.subarray(4, 12).toString('latin1'))) {
    throw httpError(400, 'That’s an iPhone HEIC photo. Choose it again from the Photos picker (it converts to JPG), or set Camera → Formats → Most Compatible.');
  }
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

const MEDIA_PATH = /^\/media\/(\d+)\/([\w-]+\.(?:jpg|png|webp))$/;
const mediaFileExists = (url) => {
  const m = url.match(MEDIA_PATH);
  return !!m && fs.existsSync(path.join(config.mediaDir, m[1], m[2]));
};

/**
 * Copy a photo from the dealer's website / DMS image host into our own /media, so the browser
 * can draw it into the post image and the image can be saved as PNG. Each address is fetched once
 * per dealership. Only public hosts, redirects re-checked, images only, 10 MB max.
 */
export async function importRemotePhoto(sourceUrl) {
  const url = String(sourceUrl || '').trim();
  if (MEDIA_PATH.test(url)) {
    if (!url.startsWith(`/media/${tenantId()}/`)) throw httpError(403, 'That photo belongs to another dealership');
    return { url };
  }
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw httpError(400, 'Photo link must start with http(s)://');
  const cached = get('SELECT media_url FROM media_imports WHERE dealership_id = ? AND source_url = ?', tenantId(), url);
  if (cached && mediaFileExists(cached.media_url)) return { url: cached.media_url };

  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    try {
      await assertPublicUrl(current);
    } catch (err) {
      throw httpError(400, err.message);
    }
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'image/*' } });
    } catch {
      throw httpError(502, 'Couldn’t reach the photo’s website');
    }
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw httpError(502, `Couldn’t download that photo (HTTP ${res.status})`);
    if (Number(res.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) throw httpError(413, 'Photos must be under 10 MB');
    const buffer = Buffer.from(await res.arrayBuffer());
    const saved = savePhoto(buffer);
    run('INSERT OR REPLACE INTO media_imports (dealership_id, source_url, media_url) VALUES (?, ?, ?)', tenantId(), url, saved.url);
    return saved;
  }
  throw httpError(502, 'That photo link redirects too many times');
}
