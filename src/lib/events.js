const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function parseEventDateTime(
  dateLabel,
  timeLabel,
  { defaultHour = 12, defaultMinute = 0 } = {}
) {
  const dateMatch = String(dateLabel || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!dateMatch) return null;

  const month = MONTH_INDEX[dateMatch[1].slice(0, 3).toLowerCase()];
  if (month == null) return null;

  const day = Number(dateMatch[2]);
  const timeText = String(timeLabel || '').trim();
  const timeMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  const hasTime = Boolean(timeMatch);

  let hour = defaultHour;
  let minute = defaultMinute;
  if (timeMatch) {
    const hour12 = Number(timeMatch[1]);
    minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toUpperCase();
    if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
    hour = hour12 % 12;
    if (meridiem === 'PM') hour += 12;
  }

  const now = new Date();
  let year = now.getFullYear();
  let start = new Date(year, month, day, hour, minute, 0, 0);
  if (start.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    year += 1;
    start = new Date(year, month, day, hour, minute, 0, 0);
  }

  return { start, hasTime };
}

function formatIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildMapsLink(location) {
  const text = String(location || '').trim();
  if (!text) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

export function buildCalendarLink(event) {
  const parsed = parseEventDateTime(event?.date, event?.time);
  if (!parsed) return null;

  const { start, hasTime } = parsed;
  const end = new Date(start.getTime() + (hasTime ? 90 : 24 * 60) * 60 * 1000);
  const title = String(event?.title || 'Hope City Event');
  const location = String(event?.location || '').trim();
  const description = [
    'Hope City Highlands event',
    location ? `Location: ${location}` : null,
    event?.signupUrl ? `Sign up: ${event.signupUrl}` : null,
  ].filter(Boolean).join('\n');

  const dateOnly = start.toISOString().slice(0, 10).replace(/-/g, '');
  const nextDateOnly = end.toISOString().slice(0, 10).replace(/-/g, '');
  const uidSuffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hope City Highlands//Event Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${uidSuffix}@hopecityhighlands.com`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    hasTime ? `DTSTART:${formatIcsUtc(start)}` : `DTSTART;VALUE=DATE:${dateOnly}`,
    hasTime ? `DTEND:${formatIcsUtc(end)}` : `DTEND;VALUE=DATE:${nextDateOnly}`,
    `SUMMARY:${escapeIcsText(title).replace(/\\n/g, ' ')}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return {
    href: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
    filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'hope-city-event'}.ics`,
  };
}
