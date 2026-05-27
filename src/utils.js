export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

export function compactText(value, maxLength = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function splitList(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createLogger(prefix = 'FreeMeal') {
  const format = (level, message) => {
    const time = new Date().toISOString();
    return `[${time}] [${prefix}] [${level}] ${message}`;
  };

  return {
    info(message) {
      console.log(format('INFO', message));
    },
    warn(message) {
      console.warn(format('WARN', message));
    },
    error(message) {
      console.error(format('ERROR', message));
    }
  };
}
