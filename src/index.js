import { loadConfig } from './config.js';
import { activityIdFromUrl, DianpingClient, shouldApply } from './dianping.js';
import { notifyBark } from './notifier.js';
import { writeReports } from './report.js';
import { compactText, sleep } from './utils.js';

async function main() {
  const config = await loadConfig();
  const client = new DianpingClient({ cookie: config.cookie });

  console.log(`[FreeMeal] Fetching activities for city ${config.cityName || config.cityId}...`);
  const list = await client.fetchActivities({
    cityId: config.cityId,
    maxPages: config.maxPages
  });

  const records = [];
  const summary = {
    city: config.cityName || config.cityId,
    total: list.length,
    selected: 0,
    success: 0,
    duplicate: 0,
    failed: 0,
    skipped: 0,
    dryRun: config.dryRun
  };

  for (const [index, activity] of list.entries()) {
    const detail = await safeFetchDetail(client, activity.detailUrl);
    const record = {
      index: index + 1,
      ...activity,
      ...detail,
      applyStatus: 'skipped',
      applyMessage: ''
    };

    if (!shouldApply(record, config.filters)) {
      record.applyMessage = '过滤规则跳过';
      summary.skipped += 1;
      records.push(record);
      continue;
    }

    if (summary.selected >= config.maxApply) {
      record.applyMessage = '超过 maxApply 限制';
      summary.skipped += 1;
      records.push(record);
      continue;
    }

    summary.selected += 1;
    const offlineActivityId = activityIdFromUrl(record.detailUrl);
    if (!offlineActivityId) {
      record.applyStatus = 'failed';
      record.applyMessage = '无法从活动链接解析 offlineActivityId';
      summary.failed += 1;
      records.push(record);
      continue;
    }

    if (config.dryRun) {
      record.applyStatus = 'dry-run';
      record.applyMessage = 'dry-run 预览，未提交报名';
      records.push(record);
      continue;
    }

    try {
      const result = await client.applyActivity(offlineActivityId, config.applyProfile);
      record.applyStatus = result.status;
      record.applyMessage = result.message;
      summary[result.status] += 1;
    } catch (error) {
      record.applyStatus = 'failed';
      record.applyMessage = error.message;
      summary.failed += 1;
    }
    records.push(record);
    await sleep(config.requestDelayMs);
  }

  const paths = await writeReports({ reportDir: config.reportDir, records, summary });
  const notification = buildNotification(summary, records, paths);
  console.log(notification.body);

  try {
    await notifyBark({
      bark: config.bark,
      title: notification.title,
      body: notification.body
    });
  } catch (error) {
    console.error(`[Bark] ${error.message}`);
  }
}

async function safeFetchDetail(client, detailUrl) {
  try {
    return await client.fetchActivityDetail(detailUrl);
  } catch (error) {
    return {
      detailError: error.message,
      winningRate: 0
    };
  }
}

function buildNotification(summary, records, paths) {
  const appliedRecords = records.filter((record) => ['success', 'duplicate', 'failed', 'dry-run'].includes(record.applyStatus));
  const preview = appliedRecords
    .slice(0, 8)
    .map((record) => `${record.index}. ${compactText(record.activityTitle, 28)}: ${record.applyMessage}`)
    .join('\n');

  const title = summary.dryRun ? '大众点评免费试 dry-run' : '大众点评免费试报名结果';
  const body = [
    `城市：${summary.city}`,
    `活动：${summary.total}，选中：${summary.selected}，跳过：${summary.skipped}`,
    `成功：${summary.success}，重复：${summary.duplicate}，失败：${summary.failed}`,
    summary.dryRun ? '状态：dry-run，未提交报名' : '状态：已执行报名',
    preview ? `\n预览：\n${preview}` : '',
    `\n报告：${paths.csvPath}`
  ].filter(Boolean).join('\n');

  return { title, body };
}

main().catch(async (error) => {
  console.error(`[FreeMeal] ${error.stack || error.message}`);
  try {
    const config = await loadConfig(['--dry-run']);
    await notifyBark({
      bark: config.bark,
      title: '大众点评免费试运行失败',
      body: error.message
    });
  } catch {
    // Keep the original failure as the process result.
  }
  process.exitCode = 1;
});
