export const VOLUNTEER_EVENT_TIME_ZONE = 'Africa/Johannesburg';
const SAST_OFFSET_MINUTES = 2 * 60;

const pad = (value) => String(value).padStart(2, '0');

const parseDateParts = (date) => {
  const match = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const parseTimeParts = (time) => {
  const text = String(time ?? '');
  const match = text.includes('T')
    ? text.match(/T(\d{2}):(\d{2})/)
    : text.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VOLUNTEER_EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const zonedParts = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
};

export const dateOnly = (value) => String(value ?? '').slice(0, 10);

export const johannesburgDatePart = (value) => zonedParts(value)?.date ?? dateOnly(value);

export const johannesburgTimePart = (value) => {
  if (!value) return '';
  const zoned = String(value).includes('T') ? zonedParts(value)?.time : null;
  if (zoned) return zoned;
  const parsed = parseTimeParts(value);
  return parsed ? `${pad(parsed.hour)}:${pad(parsed.minute)}` : String(value).slice(0, 5);
};

export const johannesburgWallTimeToUtcIso = (date, time) => {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);
  if (!dateParts || !timeParts) return '';
  return new Date(Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute - SAST_OFFSET_MINUTES,
    0,
    0
  )).toISOString();
};

export const formatJohannesburgDateTime = (value, options = {}) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: VOLUNTEER_EVENT_TIME_ZONE,
    ...options,
  }).format(date);
};

export const formatJohannesburgTime = (value, options = {}) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: VOLUNTEER_EVENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
};
