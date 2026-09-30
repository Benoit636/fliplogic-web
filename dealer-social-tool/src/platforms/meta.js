// Facebook Pages + Instagram Business publishing through the Meta Graph API.
// Account.external_id = Page ID (facebook) or IG business user ID (instagram);
// Account.access_token = a long-lived Page access token with publish permissions.
import { config } from '../config.js';

const graphUrl = (p) => `https://graph.facebook.com/${config.metaGraphVersion}/${p}`;

async function graph(method, pathName, token, params = {}) {
  const url = new URL(graphUrl(pathName));
  const init = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', token);
  } else {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify({ ...params, access_token: token });
  }
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`Meta API: ${body.error?.message || res.statusText}`);
  }
  return body;
}

export const facebookAdapter = {
  async publish(post, account, text) {
    const photo = post.media?.[0];
    const result = photo
      ? await graph('POST', `${account.external_id}/photos`, account.access_token, { url: photo, caption: text })
      : await graph('POST', `${account.external_id}/feed`, account.access_token, { message: text });
    const id = result.post_id || result.id;
    return { external_id: id, external_url: `https://www.facebook.com/${id}`, metrics: {} };
  },
  async fetchMetrics(post, account) {
    const r = await graph('GET', post.external_id, account.access_token, {
      fields: 'likes.summary(true),comments.summary(true),shares',
    });
    return {
      ...post.metrics,
      likes: r.likes?.summary?.total_count ?? 0,
      comments: r.comments?.summary?.total_count ?? 0,
      shares: r.shares?.count ?? 0,
    };
  },
  async reply(message, account, text) {
    return graph('POST', `${message.external_id}/comments`, account.access_token, { message: text });
  },
  async fetchComments(post, account) {
    const r = await graph('GET', `${post.external_id}/comments`, account.access_token, {
      fields: 'id,from,message,created_time',
      limit: '50',
    });
    return (r.data || []).map((c) => ({
      external_id: c.id,
      author: c.from?.name || 'Facebook user',
      text: c.message || '',
      received_at: c.created_time,
    }));
  },
};

export const instagramAdapter = {
  async publish(post, account, text) {
    const image = post.media?.[0];
    if (!image) throw new Error('Instagram posts need an image URL');
    const container = await graph('POST', `${account.external_id}/media`, account.access_token, {
      image_url: image,
      caption: text,
    });
    const published = await graph('POST', `${account.external_id}/media_publish`, account.access_token, {
      creation_id: container.id,
    });
    const info = await graph('GET', published.id, account.access_token, { fields: 'permalink' }).catch(() => ({}));
    return { external_id: published.id, external_url: info.permalink || '', metrics: {} };
  },
  async fetchMetrics(post, account) {
    const r = await graph('GET', post.external_id, account.access_token, { fields: 'like_count,comments_count' });
    return { ...post.metrics, likes: r.like_count ?? 0, comments: r.comments_count ?? 0 };
  },
  async reply(message, account, text) {
    return graph('POST', `${message.external_id}/replies`, account.access_token, { message: text });
  },
  async fetchComments(post, account) {
    const r = await graph('GET', `${post.external_id}/comments`, account.access_token, {
      fields: 'id,text,username,timestamp',
      limit: '50',
    });
    return (r.data || []).map((c) => ({
      external_id: c.id,
      author: c.username || 'Instagram user',
      text: c.text || '',
      received_at: c.timestamp,
    }));
  },
};
