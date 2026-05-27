import { compactText } from './utils.js';

const geocodeCache = new Map();

export function canMeasureDistance(config) {
  return Boolean(config.homeLat && config.homeLng && config.amapKey);
}

export async function enrichDistance(record, config, logger = null) {
  if (!canMeasureDistance(config)) {
    return {
      distanceKm: '',
      distanceStatus: 'unknown',
      distanceMessage: '未配置 FREEMEAL_HOME_LAT/FREEMEAL_HOME_LNG/FREEMEAL_AMAP_KEY，无法计算距离'
    };
  }

  const query = buildAddressQuery(record, config);
  if (!query) {
    return {
      distanceKm: '',
      distanceStatus: 'unknown',
      distanceMessage: '缺少可用于地理编码的活动地址或商圈'
    };
  }

  try {
    const point = await geocode(query, config.amapKey);
    if (!point) {
      return {
        distanceKm: '',
        distanceStatus: 'unknown',
        distanceMessage: `地理编码无结果：${compactText(query, 80)}`
      };
    }
    const distanceKm = Number(haversineKm(config.homeLat, config.homeLng, point.lat, point.lng).toFixed(2));
    return {
      distanceKm,
      distanceStatus: distanceKm > config.maxDistanceKm ? 'too_far' : 'nearby',
      distanceMessage: `距离 ${distanceKm}km`
    };
  } catch (error) {
    logger?.warn(`Distance lookup failed for ${compactText(record.activityTitle, 40)}: ${error.message}`);
    return {
      distanceKm: '',
      distanceStatus: 'unknown',
      distanceMessage: `距离计算失败：${compactText(error.message, 80)}`
    };
  }
}

function buildAddressQuery(record, config) {
  const pieces = [
    config.cityName,
    record.activityAddress,
    record.regionName,
    record.activityTitle
  ].filter(Boolean);
  return pieces.join(' ');
}

async function geocode(address, key) {
  const cacheKey = `${key}:${address}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    key,
    address,
    output: 'json'
  });
  const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`);
  const body = await response.json();
  if (body.status !== '1') {
    throw new Error(body.info || 'Amap geocode failed');
  }

  const location = body.geocodes?.[0]?.location || '';
  const [lngText, latText] = location.split(',');
  const point = Number.isFinite(Number(lngText)) && Number.isFinite(Number(latText))
    ? { lng: Number(lngText), lat: Number(latText) }
    : null;
  geocodeCache.set(cacheKey, point);
  return point;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const radius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
