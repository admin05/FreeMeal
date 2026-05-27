import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { activityIdFromUrl } from './dianping.js';
import { compactText } from './utils.js';

export async function loadSeenActivityIds(reportDir, logger = null) {
  const seen = new Set();
  let files = [];
  try {
    files = await readdir(reportDir);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`Failed to read report history: ${error.message}`);
    }
    return seen;
  }

  const jsonFiles = files.filter((file) => /^freemeal-.*\.json$/.test(file));
  for (const file of jsonFiles) {
    try {
      const text = await readFile(join(reportDir, file), 'utf8');
      const report = JSON.parse(text);
      for (const record of report.records || []) {
        if (record.discoveryStatus !== 'matched') {
          continue;
        }
        const id = String(record.offlineActivityId || activityIdFromUrl(record.detailUrl) || '');
        if (id) {
          seen.add(id);
        }
      }
    } catch (error) {
      logger?.warn(`Skipped unreadable report history ${compactText(file, 80)}: ${error.message}`);
    }
  }

  return seen;
}
