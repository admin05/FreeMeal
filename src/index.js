import { loadConfig } from './config.js';
import { activityIdFromUrl, DianpingClient, HttpError, shouldApply } from './dianping.js';
import { notifyBark } from './notifier.js';
import { writeReports } from './report.js';
import { compactText, createLogger, sleep } from './utils.js';

const logger = createLogger();

async function main() {
  logger.info('Script started');
  const config = await loadConfig();
  const client = new DianpingClient({ cookie: config.cookie, logger });

  logger.info([
    `Config loaded: city=${config.cityName || config.cityId}`,
    `maxPages=${config.maxPages}`,
    `maxApply=${config.maxApply}`,
    `dryRun=${config.dryRun}`,
    `cookie=${config.cookie ? 'configured' : 'missing'}`,
    `token=${config.token ? 'configured' : 'missing'}`,
    `bark=${config.bark ? 'configured' : 'missing'}`
  ].join(', '));

  logger.info(`Fetching activities for city ${config.cityName || config.cityId}`);
  const list = await client.fetchActivities({
    cityId: config.cityId,
    maxPages: config.maxPages
  });
  logger.info(`Fetched ${list.length} activities`);

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

  let applyEndpointUnavailable = false;
  for (const [index, activity] of list.entries()) {
    logger.info(`Processing ${index + 1}/${list.length}: ${compactText(activity.activityTitle, 60)}`);
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
      logger.info(`Skipped by filters: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    if (summary.selected >= config.maxApply) {
      record.applyMessage = '超过 maxApply 限制';
      summary.skipped += 1;
      logger.info(`Skipped by maxApply limit: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    if (applyEndpointUnavailable) {
      record.applyMessage = '报名接口不可用，已停止继续提交';
      summary.skipped += 1;
      logger.warn(`Skipped because apply endpoint is unavailable: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    summary.selected += 1;
    const offlineActivityId = activityIdFromUrl(record.detailUrl);
    if (!offlineActivityId) {
      record.applyStatus = 'failed';
      record.applyMessage = '无法从活动链接解析 offlineActivityId';
      summary.failed += 1;
      logger.warn(`Failed to parse activity id: ${record.detailUrl}`);
      records.push(record);
      continue;
    }

    if (config.dryRun) {
      record.applyStatus = 'dry-run';
      record.applyMessage = 'dry-run 预览，未提交报名';
      logger.info(`Dry-run selected: ${compactText(record.activityTitle, 60)} (${offlineActivityId})`);
      records.push(record);
      continue;
    }

    try {
      logger.info(`Applying activity ${offlineActivityId}: ${compactText(record.activityTitle, 60)}`);
      const result = await client.applyActivity(offlineActivityId, {
        cityId: config.cityId,
        token: config.token,
        profile: {
          ...config.applyProfile,
          lat: config.lat,
          lng: config.lng,
          locCityId: config.locCityId
        }
      });
      record.applyStatus = result.status;
      record.applyMessage = result.message;
      summary[result.status] += 1;
      logger.info(`Apply result for ${offlineActivityId}: ${result.status} - ${result.message}`);
    } catch (error) {
      record.applyStatus = 'failed';
      record.applyMessage = normalizeApplyError(error);
      summary.failed += 1;
      logger.error(`Apply failed for ${offlineActivityId}: ${record.applyMessage}`);
      if (isApplyEndpointUnavailable(error)) {
        applyEndpointUnavailable = true;
        logger.error('Apply endpoint is unavailable or blocked. Stop further apply attempts for this run.');
      }
    }
    records.push(record);
    await sleep(config.requestDelayMs);
  }

  const paths = await writeReports({ reportDir: config.reportDir, records, summary });
  logger.info(`Reports written: ${paths.csvPath}, ${paths.jsonPath}`);
  const notification = buildNotification(summary, records, paths);
  logger.info(`Run summary:\n${notification.body}`);

  try {
    logger.info('Sending Bark notification');
    await notifyBark({
      bark: config.bark,
      title: notification.title,
      body: notification.body
    });
    logger.info('Bark notification finished');
  } catch (error) {
    logger.error(`Bark notification failed: ${error.message}`);
  }

  logger.info('Script finished');
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
    .slice(0, 5)
    .map((record) => `${record.index}. ${compactText(record.activityTitle, 24)}: ${compactText(record.applyMessage, 42)}`)
    .join('\n');

  const title = summary.dryRun ? '大众点评免费试 dry-run' : '大众点评免费试报名结果';
  const lines = [
    `城市：${summary.city}`,
    `活动：${summary.total}，选中：${summary.selected}，跳过：${summary.skipped}`,
    `成功：${summary.success}，重复：${summary.duplicate}，失败：${summary.failed}`,
    summary.dryRun ? '状态：dry-run，未提交报名' : '状态：已执行报名',
    preview ? `\n预览：\n${preview}` : '',
    `\n报告：${paths.csvPath}`
  ];
  const body = truncate(lines.filter(Boolean).join('\n'), 900);

  return { title, body };
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizeApplyError(error) {
  if (isApplyEndpointUnavailable(error)) {
    if (error.status === 403) {
      return '报名接口返回 403，App 接口可能需要大众点评原生 MAPI/Shark 通道或额外签名，已停止继续提交';
    }
    return '报名接口返回 404，请重新抓包确认 preapply/doapply 接口是否变化';
  }
  return compactText(error.message, 180);
}

function isApplyEndpointUnavailable(error) {
  return error instanceof HttpError
    && [403, 404].includes(error.status)
    && /\/bwc\/customer\/(?:preapply|doapply|loadactivitydetail)\.bin/.test(String(error.url || ''));
}

main().catch(async (error) => {
  logger.error(error.stack || error.message);
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
