import { readFile } from 'node:fs/promises';

const file = process.argv[2];
const showSecret = process.argv.includes('--show-secret');

if (!file) {
  console.error('Usage: node scripts/extract-token.js <capture.har> [--show-secret]');
  process.exit(1);
}

const har = JSON.parse(await readFile(file, 'utf8'));
const entries = har.log?.entries || [];
const candidates = [];

for (const [index, entry] of entries.entries()) {
  const request = entry.request || {};
  const postText = request.postData?.text || '';
  const token = extractToken(postText);
  if (!token) {
    continue;
  }
  candidates.push({
    index,
    method: request.method,
    url: request.url,
    token
  });
}

if (candidates.length === 0) {
  console.log('No token found in HAR request bodies.');
  process.exit(1);
}

for (const candidate of candidates) {
  console.log(`entry=${candidate.index}`);
  console.log(`method=${candidate.method}`);
  console.log(`url=${candidate.url}`);
  console.log(`token=${showSecret ? candidate.token : mask(candidate.token)}`);
  console.log('');
}

function extractToken(text) {
  if (!text) {
    return '';
  }
  try {
    const parsed = JSON.parse(text);
    return findToken(parsed);
  } catch {
    const match = text.match(/"token"\s*:\s*"([^"]+)"/);
    return match?.[1] ? unescapeJsonString(match[1]) : '';
  }
}

function findToken(value) {
  if (!value || typeof value !== 'object') {
    return '';
  }
  if (typeof value.token === 'string' && value.token.length > 12) {
    return value.token;
  }
  for (const item of Object.values(value)) {
    const token = findToken(item);
    if (token) {
      return token;
    }
  }
  return '';
}

function mask(value) {
  if (value.length <= 12) {
    return '[REDACTED]';
  }
  return `${value.slice(0, 6)}...[REDACTED]...${value.slice(-6)}`;
}

function unescapeJsonString(value) {
  return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
}
