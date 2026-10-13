// Time-zone helpers so each dealership's schedule runs on its own local clock.

function parts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(out.weekday),
  };
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function tzOffsetMs(date, timeZone) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `timeZone` to a real Date. */
export function zonedToDate({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - tzOffsetMs(new Date(guess), timeZone);
  const corrected = guess - tzOffsetMs(new Date(result), timeZone); // DST edge
  if (corrected !== result) result = corrected;
  return new Date(result);
}

export function localParts(date, timeZone) {
  return parts(date, timeZone);
}

export function formatOffset(date, timeZone) {
  const mins = Math.round(tzOffsetMs(date, timeZone) / 60000);
  const sign = mins >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${sign}${pad(Math.abs(mins) / 60)}:${pad(Math.abs(mins) % 60)}`;
}
