const MARKET_TIME_ZONE = 'America/New_York';

function getParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);

  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    weekday: read('weekday'),
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  };
}

export function getMarketSessionInfo(value = new Date()) {
  const parts = getParts(value);
  const minutes = parts.hour * 60 + parts.minute;
  const isWeekday = !['Sat', 'Sun'].includes(parts.weekday);

  return {
    timeZone: MARKET_TIME_ZONE,
    sessionDate: parts.year + '-' + parts.month + '-' + parts.day,
    isWeekday,
    isRegularHours: isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60,
    isAfterRegularHours: isWeekday && minutes >= 16 * 60,
  };
}

export function shouldEvaluateLargeMove(value = new Date(), marketState = '') {
  const session = getMarketSessionInfo(value);
  const normalizedState = String(marketState || '').trim().toUpperCase();

  if (!session.isRegularHours) return false;
  return !normalizedState || normalizedState === 'REGULAR';
}

export function shouldEmitLargeMoveSummary(value = new Date()) {
  return getMarketSessionInfo(value).isAfterRegularHours;
}
