// Facebook Pages + Instagram Business publishing through the Meta Graph API.
// Account.external_id = Page ID (facebook) or IG business user ID (instagram);
// Account.access_token = a long-lived Page access token (Page tokens from a long-lived user token do not expire).
import { config } from '../config.js';
import { request } from './http.js';

export const graphUrl = (p) => `https://graph.facebook.com/${config.metaGraphVersion}/${p}`;

async function graph(method, pathName, token, params = {}) {
  if (method === 'GET') {
    const url = new URL(graphUrl(pathName));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (token) url.searchParams.set('access_token', token);
    return (await request(url.toString())).body;
  }
  return (await request(graphUrl(pathName), { method, json: { ...params, access_token: token } })).body;
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

// ---- OAuth (Facebook Login) ----
export const metaOAuth = {
  configured: () => !!(config.metaAppId && config.metaAppSecret),
  scopes: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_engagement',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'business_management',
  ],
  authorizeUrl({ state, redirectUri }) {
    const url = new URL(`https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: config.metaAppId, redirect_uri: redirectUri, state, scope: this.scopes.join(',') });
    return url.toString();
  },
  async exchange({ code, redirectUri }) {
    const short = await graph('GET', 'oauth/access_token', '', {
      client_id: config.metaAppId,
      client_secret: config.metaAppSecret,
      redirect_uri: redirectUri,
      code,
    });
    const long = await graph('GET', 'oauth/access_token', '', {
      grant_type: 'fb_exchange_token',
      client_id: config.metaAppId,
      client_secret: config.metaAppSecret,
      fb_exchange_token: short.access_token,
    });
    const pages = await graph('GET', 'me/accounts', long.access_token, {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: '100',
    });
    const options = [];
    for (const page of pages.data || []) {
      options.push({ platform: 'facebook', external_id: page.id, display_name: page.name, access_token: page.access_token });
      const ig = page.instagram_business_account;
      if (ig) options.push({ platform: 'instagram', external_id: ig.id, display_name: `@${ig.username || page.name}`, access_token: page.access_token });
    }
    return options;
  },
};
