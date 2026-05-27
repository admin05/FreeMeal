export async function notifyBark({ bark, title, body, url = '' }) {
  if (!bark) {
    console.log(`[${new Date().toISOString()}] [Bark] [INFO] BARK is not configured, skip notification.`);
    return { skipped: true, reason: 'missing BARK' };
  }

  const request = buildBarkRequest(bark, title, body, url);
  const response = await fetch(request.url, request.options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bark notification failed: HTTP ${response.status} ${text}`);
  }
  return { skipped: false };
}

function buildBarkRequest(value, title, body, targetUrl = '') {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/$/, '');
    if (pathname.split('/').filter(Boolean).length >= 2) {
      return { url: raw, options: { method: 'GET' } };
    }
    return {
      url: url.toString(),
      options: jsonPostOptions(title, body, targetUrl)
    };
  }
  return {
    url: `https://api.day.app/${encodeURIComponent(raw)}`,
    options: jsonPostOptions(title, body, targetUrl)
  };
}

function jsonPostOptions(title, body, url = '') {
  const payload = { title, body };
  if (url) {
    payload.url = url;
  }
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}
