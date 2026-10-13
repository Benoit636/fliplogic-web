// Small fetch wrapper for the social network APIs with readable errors.

export async function request(url, { method = 'GET', token, headers = {}, json, form, timeout = 30_000 } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeout) };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  const apiError =
    body.error?.message || body.error_description || (typeof body.error === 'string' ? body.error : '') || body.detail || body.message || body.title;
  if (!res.ok || (body.error && body.error.code && body.error.code !== 'ok')) {
    throw new Error(`${new URL(url).hostname}: ${apiError || `HTTP ${res.status}`}`);
  }
  return { body, headers: res.headers, status: res.status };
}

export const expiresAt = (seconds) => (seconds ? new Date(Date.now() + Number(seconds) * 1000).toISOString() : null);
