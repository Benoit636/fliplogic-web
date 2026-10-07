// Simulated network: lets a dealership try the whole workflow (and demo it)
// before connecting real accounts. Metrics grow deterministically over time.

function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const BASE_REACH = { facebook: 900, instagram: 1400, tiktok: 3000, x: 500, linkedin: 350, google_business: 600 };

export function simulatedMetrics(post, now = Date.now()) {
  const publishedAt = post.published_at ? new Date(post.published_at).getTime() : now;
  const hours = Math.max(0, (now - publishedAt) / 3_600_000);
  const growth = 0.08 + 0.92 * (1 - Math.exp(-hours / 18)); // most engagement lands in the first day
  const r = seeded(post.id);
  const vehicleBoost = post.vehicle_id ? 1.25 : 1;
  const reach = Math.round((BASE_REACH[post.platform] || 500) * (0.5 + r) * vehicleBoost * growth);
  const likes = Math.round(reach * (0.03 + r * 0.04));
  return {
    reach,
    impressions: Math.round(reach * 1.4),
    likes,
    comments: Math.round(likes * (0.08 + r * 0.1)),
    shares: Math.round(likes * (0.05 + r * 0.08)),
    clicks: Math.round(reach * (0.01 + r * 0.02)),
    leads: post.vehicle_id ? Math.round(reach * 0.002 * (0.5 + r)) : 0,
  };
}

export const simulatedAdapter = {
  async publish(post) {
    const externalId = `sim_${post.platform}_${post.id}_${Date.now().toString(36)}`;
    return {
      external_id: externalId,
      external_url: `https://example.com/${post.platform}/posts/${externalId}`,
      metrics: simulatedMetrics({ ...post, published_at: new Date().toISOString() }),
    };
  },
  async fetchMetrics(post) {
    return simulatedMetrics(post);
  },
  async reply() {
    return { external_id: `sim_reply_${Date.now().toString(36)}` };
  },
  async fetchComments() {
    return [];
  },
};
