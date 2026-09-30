// Google Business Profile: local posts, reviews and review replies.
// Account.external_id = "accounts/{accountId}/locations/{locationId}".
import { config } from '../config.js';
import { request, expiresAt } from './http.js';

const V4 = 'https://mybusiness.googleapis.com/v4';
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export const googleAdapter = {
  async publish(post, account, text) {
    const body = {
      languageCode: 'en',
      summary: text.slice(0, 1500),
      topicType: 'STANDARD',
    };
    if (post.media?.[0]) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: post.media[0] }];
    if (post.link_url) body.callToAction = { actionType: 'LEARN_MORE', url: post.link_url };
    const { body: res } = await request(`${V4}/${account.external_id}/localPosts`, { method: 'POST', token: account.access_token, json: body });
    return { external_id: res.name, external_url: res.searchUrl || '', metrics: {} };
  },
  async fetchMetrics(post) {
    return post.metrics; // Google does not expose per-post engagement in this API.
  },
  async reply(message, account, text) {
    // message.external_id = accounts/../locations/../reviews/..
    return request(`${V4}/${message.external_id}/reply`, { method: 'PUT', token: account.access_token, json: { comment: text } });
  },
  async fetchComments() {
    return [];
  },
  async fetchReviews(account) {
    const { body } = await request(`${V4}/${account.external_id}/reviews?pageSize=50`, { token: account.access_token });
    return (body.reviews || [])
      .filter((r) => !r.reviewReply)
      .map((r) => ({
        external_id: r.name,
        author: r.reviewer?.displayName || 'Google user',
        rating: STARS[r.starRating] || null,
        text: r.comment || `(${STARS[r.starRating] || '?'}-star rating with no comment)`,
        received_at: r.createTime,
      }));
  },
  async refresh(account) {
    const { body } = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: {
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
      },
    });
    return { access_token: body.access_token, token_expires_at: expiresAt(body.expires_in) };
  },
};

export const googleOAuth = {
  configured: () => !!(config.googleClientId && config.googleClientSecret),
  authorizeUrl({ state, redirectUri }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return url.toString();
  },
  async exchange({ code, redirectUri }) {
    const { body: token } = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: config.googleClientId, client_secret: config.googleClientSecret },
    });
    const { body: accounts } = await request('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { token: token.access_token });
    const options = [];
    for (const acct of accounts.accounts || []) {
      const { body: locs } = await request(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title&pageSize=100`,
        { token: token.access_token },
      ).catch(() => ({ body: {} }));
      for (const loc of locs.locations || []) {
        options.push({
          platform: 'google_business',
          external_id: `${acct.name}/${loc.name}`,
          display_name: loc.title || loc.name,
          access_token: token.access_token,
          refresh_token: token.refresh_token || '',
          token_expires_at: expiresAt(token.expires_in),
        });
      }
    }
    return options;
  },
};
