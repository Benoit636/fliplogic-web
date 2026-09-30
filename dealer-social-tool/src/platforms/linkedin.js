// LinkedIn Company Page posting via the versioned REST API (Posts API).
// Account.external_id = numeric organization ID.
import { config } from '../config.js';
import { request, expiresAt } from './http.js';

const API = 'https://api.linkedin.com/rest';
const headers = () => ({ 'LinkedIn-Version': config.linkedinVersion, 'X-Restli-Protocol-Version': '2.0.0' });

/** LinkedIn "little text" format: escape reserved characters and turn #words into hashtags. */
export function toLittleText(text) {
  const escape = (s) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/#(\w+)/g)) {
    out += `${escape(text.slice(last, m.index))}{hashtag|\\#|${m[1]}}`;
    last = m.index + m[0].length;
  }
  return out + escape(text.slice(last));
}

export const linkedinAdapter = {
  async publish(post, account, text) {
    const author = `urn:li:organization:${account.external_id}`;
    const res = await request(`${API}/posts`, {
      method: 'POST',
      token: account.access_token,
      headers: headers(),
      json: {
        author,
        commentary: toLittleText(text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
    });
    const urn = res.headers.get('x-restli-id') || res.body.id;
    return { external_id: urn, external_url: `https://www.linkedin.com/feed/update/${urn}`, metrics: {} };
  },
  async fetchMetrics(post, account) {
    const { body } = await request(`${API}/socialActions/${encodeURIComponent(post.external_id)}`, { token: account.access_token, headers: headers() });
    return {
      ...post.metrics,
      likes: body.likesSummary?.totalLikes ?? 0,
      comments: body.commentsSummary?.aggregatedTotalComments ?? 0,
    };
  },
  async reply() {
    throw new Error('Replying to LinkedIn comments from Dealer Social is not supported yet — reply on LinkedIn directly');
  },
  async fetchComments() {
    return [];
  },
  async refresh(account) {
    const { body } = await request('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      form: {
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
        client_id: config.linkedinClientId,
        client_secret: config.linkedinClientSecret,
      },
    });
    return { access_token: body.access_token, refresh_token: body.refresh_token, token_expires_at: expiresAt(body.expires_in) };
  },
};

export const linkedinOAuth = {
  configured: () => !!(config.linkedinClientId && config.linkedinClientSecret),
  authorizeUrl({ state, redirectUri }) {
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.linkedinClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'w_organization_social r_organization_social rw_organization_admin',
    });
    return url.toString();
  },
  async exchange({ code, redirectUri }) {
    const { body: token } = await request('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.linkedinClientId,
        client_secret: config.linkedinClientSecret,
      },
    });
    const { body: acls } = await request(`${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, {
      token: token.access_token,
      headers: headers(),
    });
    const options = [];
    for (const acl of acls.elements || []) {
      const id = String(acl.organization || '')
        .split(':')
        .pop();
      if (!id) continue;
      const org = await request(`${API}/organizations/${id}`, { token: token.access_token, headers: headers() }).catch(() => ({ body: {} }));
      options.push({
        platform: 'linkedin',
        external_id: id,
        display_name: org.body.localizedName || `Organization ${id}`,
        access_token: token.access_token,
        refresh_token: token.refresh_token || '',
        token_expires_at: expiresAt(token.expires_in),
      });
    }
    return options;
  },
};
