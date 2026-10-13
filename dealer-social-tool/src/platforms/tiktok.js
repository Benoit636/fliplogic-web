// TikTok Content Posting API: direct photo carousels (or a video when the first media URL is .mp4).
// Media URLs must be on a domain verified in the TikTok developer portal.
import { config } from '../config.js';
import { request, expiresAt } from './http.js';

const API = 'https://open.tiktokapis.com/v2';

export const tiktokAdapter = {
  async publish(post, account, text) {
    const media = post.media || [];
    if (!media.length) throw new Error('TikTok posts need at least one photo or a video URL');
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(media[0]);
    const postInfo = { title: text.slice(0, 90), privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false };
    const { body } = isVideo
      ? await request(`${API}/post/publish/video/init/`, {
          method: 'POST',
          token: account.access_token,
          json: { post_info: { ...postInfo, title: text.slice(0, 2200) }, source_info: { source: 'PULL_FROM_URL', video_url: media[0] } },
        })
      : await request(`${API}/post/publish/content/init/`, {
          method: 'POST',
          token: account.access_token,
          json: {
            post_info: { ...postInfo, description: text.slice(0, 4000), auto_add_music: true },
            source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: media.slice(0, 35) },
            post_mode: 'DIRECT_POST',
            media_type: 'PHOTO',
          },
        });
    return { external_id: body.data?.publish_id, external_url: '', metrics: {} };
  },
  async fetchMetrics(post) {
    return post.metrics;
  },
  async reply() {
    throw new Error('Replying to TikTok comments is not available through the TikTok API — reply in the TikTok app');
  },
  async fetchComments() {
    return [];
  },
  async refresh(account) {
    const { body } = await request(`${API}/oauth/token/`, {
      method: 'POST',
      form: { client_key: config.tiktokClientKey, client_secret: config.tiktokClientSecret, grant_type: 'refresh_token', refresh_token: account.refresh_token },
    });
    return { access_token: body.access_token, refresh_token: body.refresh_token, token_expires_at: expiresAt(body.expires_in) };
  },
};

export const tiktokOAuth = {
  configured: () => !!(config.tiktokClientKey && config.tiktokClientSecret),
  authorizeUrl({ state, redirectUri }) {
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.search = new URLSearchParams({
      client_key: config.tiktokClientKey,
      scope: 'user.info.basic,video.publish',
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    return url.toString();
  },
  async exchange({ code, redirectUri }) {
    const { body: token } = await request(`${API}/oauth/token/`, {
      method: 'POST',
      form: { client_key: config.tiktokClientKey, client_secret: config.tiktokClientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri },
    });
    const { body: info } = await request(`${API}/user/info/?fields=open_id,display_name`, { token: token.access_token }).catch(() => ({ body: {} }));
    return [
      {
        platform: 'tiktok',
        external_id: token.open_id,
        display_name: info.data?.user?.display_name || 'TikTok account',
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: expiresAt(token.expires_in),
      },
    ];
  },
};
