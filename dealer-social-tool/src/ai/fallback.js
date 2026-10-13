// Template-based writer used when no Claude API key is configured, so the
// dealership can still run the full workflow. Output is intentionally simple.
import { PLATFORMS } from '../config.js';
import { vehicleTitle } from '../services/inventory.js';
import { defaultHashtags } from '../services/dealership.js';

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const tagify = (s) => `#${String(s).replace(/[^a-z0-9]/gi, '')}`;

function vehicleLine(v, d) {
  const bits = [v.exterior_color, vehicleTitle(v)].filter(Boolean).join(' ');
  const extras = [v.mileage != null && `${Number(v.mileage).toLocaleString('en-US')} ${d.distance_unit || 'km'}`, v.price != null && money(v.price)]
    .filter(Boolean)
    .join(' • ');
  return extras ? `${bits} — ${extras}` : bits;
}

function body(postType, v, d, instructions) {
  const title = v ? vehicleTitle(v) : '';
  switch (postType) {
    case 'vehicle_spotlight':
      return [`🚗 Spotlight: ${title}`, vehicleLine(v, d), v.features && `Highlights: ${v.features}`];
    case 'new_arrival':
      return [`✨ Just arrived at ${d.name}: ${title}!`, vehicleLine(v, d), v.features && `Loaded with ${v.features}.`, 'Be the first to take it for a spin.'];
    case 'price_drop':
      return [
        `💥 Price drop on our ${title}!`,
        v.previous_price ? `Was ${money(v.previous_price)}, now ${money(v.price)}.` : `Now just ${money(v.price)}.`,
        v.features && `Features: ${v.features}`,
      ];
    case 'sold_celebration':
      return [`🎉 Congratulations to the newest owner of this ${title}!`, `Thank you for choosing ${d.name} — enjoy the ride!`];
    case 'promotion':
      return [`🔥 Special event at ${d.name}!`, instructions || 'Great savings across our lineup this month.'];
    case 'event':
      return [`📅 You're invited! Join us at ${d.name}.`, instructions || 'Food, fun and test drives for the whole family.'];
    case 'service_tip':
      return [
        '🔧 Service tip of the week:',
        instructions || 'Check your tire pressure monthly — it improves fuel economy, handling and tire life.',
        `Our service team is here to help.`,
      ];
    case 'review_highlight':
      return [
        '⭐⭐⭐⭐⭐ Our customers say it best:',
        instructions ? `"${instructions}"` : '"Amazing experience from start to finish!"',
        `Thank you for trusting ${d.name}.`,
      ];
    case 'holiday':
      return [`🎊 Happy holidays from the whole team at ${d.name}!`, instructions || 'Wishing you and your family safe travels.'];
    case 'engagement':
      return ['🤔 Quick question for our community:', instructions || 'What was your very first car? Tell us in the comments! 👇'];
    case 'team_spotlight':
      return [`👋 Meet the team at ${d.name}!`, instructions || 'The friendly faces who make every visit a great one.'];
    default:
      return [instructions || `News from ${d.name}.`];
  }
}

export function fallbackPost({ postType, vehicle, platform, instructions, dealer }) {
  const rules = PLATFORMS[platform];
  const lines = body(postType, vehicle, dealer, instructions).filter(Boolean);
  const wantsCta = !['holiday', 'engagement', 'sold_celebration'].includes(postType);
  if (wantsCta && dealer.call_to_action) lines.push(dealer.call_to_action);
  if (dealer.phone && platform !== 'x') lines.push(`📞 ${dealer.phone}`);
  if (vehicle?.price != null && dealer.compliance_notes && platform !== 'x') lines.push(dealer.compliance_notes);

  let content = lines.join(platform === 'x' ? ' ' : '\n\n');
  const tags = [...defaultHashtags(dealer)];
  if (vehicle) tags.push(tagify(vehicle.make), tagify(`${vehicle.make}${vehicle.model}`));
  if (dealer.city) tags.push(tagify(dealer.city));
  const hashtags = [...new Set(tags)].slice(0, rules.maxHashtags);

  const budget = rules.maxChars - (hashtags.join(' ').length + 2);
  if (content.length > budget) content = `${content.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;

  return {
    platform,
    title: vehicle ? `${vehicleTitle(vehicle)} – ${postType.replace(/_/g, ' ')}` : postType.replace(/_/g, ' '),
    content,
    hashtags,
    image_idea: vehicle ? `Best exterior 3/4 front photo of the ${vehicleTitle(vehicle)}` : 'Bright photo of the showroom or team',
  };
}
