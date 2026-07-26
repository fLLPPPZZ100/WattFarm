/**
 * Account age formatting.
 *
 * ## Precision rules
 *
 * The unit shown gets coarser as the account gets older, because "4 meses,
 * 7 dias, 21 horas" is noise — nobody reads past the first number once it is in
 * months:
 *
 *   under a minute   "menos de 1 minuto"
 *   under an hour    "12 minutos"
 *   under a day      "5 horas"
 *   under a month    "7 dias, 21 horas"   (hours dropped when exactly 0)
 *   under a year     "3 meses"
 *   a year or more   "2 anos"
 *
 * ## Why calendar arithmetic and not milliseconds
 *
 * Dividing an elapsed millisecond count by 30 days is the obvious approach and
 * it drifts: an account created on 31 January is "1 month" old on 2 March by
 * that maths, and February/leap years make the error grow. This walks the
 * calendar fields and borrows between them, so "1 mês" means the same calendar
 * day one month later, whatever the month length.
 *
 * Kept free of React and of any import so it can be exercised directly —
 * see `apps/web/scripts/test-account-age.mjs`.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Portuguese singular/plural for the units used below. */
const UNITS = {
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['dia', 'dias'],
  month: ['mês', 'meses'],
  year: ['ano', 'anos'],
};

function plural(unit, value) {
  const [singular, many] = UNITS[unit];
  return `${value} ${value === 1 ? singular : many}`;
}

/**
 * Adds whole months, clamping the day to the target month's length.
 *
 * This is where "one month after 31 January" gets decided. There is no single
 * right answer, so the convention is the same one calendars and billing use:
 * clamp to the last day of the shorter month, giving 28 February (29 in a leap
 * year). The alternative — overflowing into 3 March — would make an account
 * created on the 31st report its monthly anniversary on a different day of the
 * month every time.
 */
function addMonthsClamped(date, monthsToAdd) {
  const absoluteMonth = date.getMonth() + monthsToAdd;
  const targetYear = date.getFullYear() + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;

  // Day 0 of the following month is the last day of this one.
  const lastDayOfTarget = new Date(targetYear, targetMonth + 1, 0).getDate();

  return new Date(
    targetYear,
    targetMonth,
    Math.min(date.getDate(), lastDayOfTarget),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}

/**
 * Parses whatever the API hands us into a Date, or null.
 *
 * `createdAt` arrives as an ISO string over JSON, but a Date or a numeric
 * timestamp is accepted too so callers do not have to normalise first.
 *
 * @param {string | number | Date | null | undefined} value
 * @returns {Date | null}
 */
export function parseDate(value) {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calendar difference between two dates, with each field already borrowed so
 * every value is non-negative.
 *
 * @param {Date} from earlier date
 * @param {Date} to later date
 * @returns {{years:number, months:number, days:number, hours:number, minutes:number, totalMonths:number}}
 */
export function calendarDiff(from, to) {
  if (to.getTime() <= from.getTime()) {
    return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, totalMonths: 0 };
  }

  /**
   * Borrowing field by field does not work here.
   *
   * The obvious version subtracts each field and borrows the previous month's
   * length when days go negative. From 31 January to 2 March that is
   * `2 - 31 + 28 = -1` — still negative, because the origin day exceeds the
   * borrowed month entirely. One borrow is not always enough, and chaining more
   * gets ambiguous fast.
   *
   * Instead: find the most recent monthly anniversary at or before `to`, then
   * measure the leftover directly. Anniversary arithmetic has one clear rule
   * (see addMonthsClamped) and no borrowing at all.
   */
  let totalMonths =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (totalMonths < 0) totalMonths = 0;

  let anniversary = addMonthsClamped(from, totalMonths);

  // The month-number difference can overshoot by one when the day-of-month or
  // the time of day has not been reached yet.
  while (totalMonths > 0 && anniversary.getTime() > to.getTime()) {
    totalMonths -= 1;
    anniversary = addMonthsClamped(from, totalMonths);
  }

  /**
   * The sub-month remainder is measured in elapsed milliseconds. Across a
   * daylight-saving transition that makes one day 23 or 25 hours long, so the
   * hour figure can be off by one for a few days a year. Accepted: the
   * alternative is timezone-aware date maths for a cosmetic string.
   */
  let remainder = Math.max(0, to.getTime() - anniversary.getTime());

  const days = Math.floor(remainder / DAY_MS);
  remainder -= days * DAY_MS;
  const hours = Math.floor(remainder / HOUR_MS);
  remainder -= hours * HOUR_MS;
  const minutes = Math.floor(remainder / MINUTE_MS);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12, // months within the year, not the total
    days,
    hours,
    minutes,
    totalMonths,
  };
}

/**
 * Human-readable account age.
 *
 * @param {string | number | Date | null | undefined} createdAt
 * @param {Date} [now] injectable for testing
 * @returns {string | null} null when `createdAt` is missing or unparseable
 */
export function formatAccountAge(createdAt, now = new Date()) {
  const created = parseDate(createdAt);
  if (!created) return null;

  // Clock skew between the server and the browser can put creation slightly in
  // the future. Reporting a negative age would be worse than rounding to zero.
  if (created.getTime() > now.getTime()) return 'menos de 1 minuto';

  const { years, days, hours, minutes, totalMonths } = calendarDiff(created, now);

  if (years >= 1) return plural('year', years);
  if (totalMonths >= 1) return plural('month', totalMonths);

  if (days >= 1) {
    // Hours are only worth showing while days are still the leading unit, and
    // "7 dias, 0 horas" reads worse than "7 dias".
    return hours > 0 ? `${plural('day', days)}, ${plural('hour', hours)}` : plural('day', days);
  }

  if (hours >= 1) return plural('hour', hours);
  if (minutes >= 1) return plural('minute', minutes);

  return 'menos de 1 minuto';
}

/**
 * Creation date for display, e.g. "24 de julho de 2026".
 *
 * @param {string | number | Date | null | undefined} createdAt
 * @param {string} [locale]
 * @returns {string | null}
 */
export function formatJoinDate(createdAt, locale = 'pt-BR') {
  const created = parseDate(createdAt);
  if (!created) return null;

  return created.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * How long until the displayed age could change, in ms — used to schedule a
 * re-render. A minutes-old account needs a tick a minute; a two-year-old one
 * does not, and polling it every minute for a string that changes once a year
 * is wasted work.
 *
 * @param {string | number | Date | null | undefined} createdAt
 * @param {Date} [now]
 * @returns {number | null} null when no refresh is worth scheduling
 */
export function nextAgeRefreshMs(createdAt, now = new Date()) {
  const created = parseDate(createdAt);
  if (!created) return null;

  const elapsed = now.getTime() - created.getTime();

  // Under a day the leading unit is minutes or hours, so tick every 30s.
  if (elapsed < DAY_MS) return 30_000;

  // Days-and-hours resolution: the hour figure changes at most hourly, and a
  // tick every 5 minutes keeps it close enough without busy work.
  if (elapsed < 31 * DAY_MS) return 5 * 60_000;

  // Months and years: no live refresh. A page load will pick it up.
  return null;
}
