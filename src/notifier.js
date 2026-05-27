export async function notifyBark({ bark, title, body }) {
  if (!bark) {
    console.log(`[${new Date().toISOString()}] [Bark] [INFO] BARK is not configured, skip notification.`);
    return { skipped: true, reason: 'missing BARK' };
  }

  const url = buildBarkUrl(bark, title, body);
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bark notification failed: HTTP ${response.status} ${text}`);
  }
  return { skipped: false };
}

function buildBarkUrl(value, title, body) {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/$/, '');
    if (pathname.split('/').filter(Boolean).length >= 2) {
      return raw;
    }
    url.pathname = `${pathname}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    return url.toString();
  }
  return `https://api.day.app/${encodeURIComponent(raw)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
}
