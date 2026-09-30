import { PLATFORMS, POST_TYPES } from '../config.js';
import { vehicleTitle } from '../services/inventory.js';

export function dealershipBrief(d) {
  return [
    `Dealership: ${d.name}`,
    d.brands && `Brands sold: ${d.brands}`,
    d.city && `Location: ${d.city}${d.address ? ` (${d.address})` : ''}`,
    d.phone && `Phone: ${d.phone}`,
    d.website && `Website: ${d.website}`,
    `Brand voice: ${d.brand_voice}`,
    d.call_to_action && `Preferred call to action: ${d.call_to_action}`,
    d.default_hashtags && `Always-on hashtags: ${d.default_hashtags}`,
    d.compliance_notes && `Compliance / legal notes: ${d.compliance_notes}`,
    `Write in: ${d.language || 'English'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const PLATFORM_GUIDE = Object.entries(PLATFORMS)
  .map(([key, p]) => `- ${key} (${p.label}): max ${p.maxChars} characters including hashtags, up to ${p.maxHashtags} hashtags${p.requiresMedia ? ', always accompanied by a photo/video' : ''}`)
  .join('\n');

export const COPYWRITER_RULES = `You are the social media copywriter for a car dealership.
Rules:
- Match the dealership's brand voice. Sound like a real local business, not an ad robot.
- Tailor each platform: Facebook = conversational with details; Instagram = visual, emoji-friendly, hashtags at the end;
  TikTok = short hook for a video caption; X = punchy, under 280 characters total; LinkedIn = professional, community/business angle;
  google_business = plain informative update, no hashtags.
- Only state vehicle facts that are provided. Never invent prices, rebates, APRs, payments, mileage or features.
- If a price is mentioned, add the compliance note briefly where space allows.
- End with a clear call to action (visit, call, DM, book a test drive).
- Hashtags go in the "hashtags" array (with the leading #), not inside the content text.
- "image_idea" describes the ideal photo or short video to pair with the post.

Platform limits:
${PLATFORM_GUIDE}`;

export function vehicleFacts(v, unit = '') {
  if (!v) return '';
  const lines = [
    `Vehicle: ${vehicleTitle(v)} (${v.condition})`,
    v.stock_number && `Stock #: ${v.stock_number}`,
    v.price != null && `Price: $${Number(v.price).toLocaleString('en-US')}`,
    v.previous_price != null && v.price != null && v.previous_price > v.price && `Previous price: $${Number(v.previous_price).toLocaleString('en-US')}`,
    v.mileage != null && `Odometer: ${Number(v.mileage).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`,
    v.exterior_color && `Color: ${v.exterior_color}`,
    v.features && `Features: ${v.features}`,
    `Status: ${v.status}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function postRequest({ postType, vehicle, platforms, instructions, unit }) {
  return [
    `Write one ${POST_TYPES[postType] || postType} post for each of these platforms: ${platforms.join(', ')}.`,
    vehicle ? `\n${vehicleFacts(vehicle, unit)}` : '',
    instructions ? `\nExtra instructions from the dealership: ${instructions}` : '',
  ].join('\n');
}
