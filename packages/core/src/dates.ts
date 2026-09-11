import { Temporal } from 'temporal-polyfill'
import type { Recurrence } from './types'

export { Temporal }

/** Today as a PlainDate in the user's local timezone. */
export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO()
}

/** Parse a YYYY-MM-DD field; returns null for empty/invalid strings. */
export function parsePlainDate(s: string): Temporal.PlainDate | null {
  if (!s) return null
  try {
    return Temporal.PlainDate.from(s)
  } catch {
    return null
  }
}

/** "Jun 15, 2026", or '' when empty or invalid. */
export function formatDate(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28", or '' when empty or invalid. */
export function formatDateShort(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28, 26", or '' when empty or invalid. */
export function formatDateLong(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : ''
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'outcome'

/** Null past a week out, where a relative hint adds nothing. `from` is injectable for tests. */
export function relativeDue(iso: string, from: Temporal.PlainDate = today()): { text: string; tone: DueTone } | null {
  const due = parsePlainDate(iso)
  if (!due) return null
  const days = from.until(due, { largestUnit: 'day' }).days
  if (days < 0) return { text: `${-days}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'Today', tone: 'today' }
  if (days === 1) return { text: 'Tomorrow', tone: 'today' }
  if (days <= 6) return { text: `In ${days}d`, tone: 'soon' }
  return null
}

/** The date `n` occurrences after `date`, each occurrence `every` intervals apart. */
function addRecurrenceUnit(
  date: Temporal.PlainDate,
  interval: Recurrence['interval'],
  every: number,
  n: number
): Temporal.PlainDate {
  const amount = every * n
  switch (interval) {
    case 'daily':
      return date.add({ days: amount })
    case 'weekly':
      return date.add({ weeks: amount })
    case 'monthly':
      return date.add({ months: amount })
    case 'yearly':
      return date.add({ years: amount })
  }
}

/** Rough days per step, only to pick a starting guess for the fast-forward search below. */
const ROUGH_UNIT_DAYS: Record<Recurrence['interval'], number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }

/**
 * Every future date a recurring task falls due, stepping forward from its own start/due date
 * (exclusive) by the recurrence's interval, bounded by the recurrence's own end date (if any)
 * and by `rangeEnd`. Dates before `rangeStart` are skipped. Used to draw a recurring task at
 * each date it repeats on a timeline, rather than just its own dates.
 */
export function recurrenceOccurrences(
  recurrence: Recurrence,
  anchor: Temporal.PlainDate,
  rangeStart: Temporal.PlainDate,
  rangeEnd: Temporal.PlainDate
): Temporal.PlainDate[] {
  const every = Math.max(1, recurrence.every)
  const hardEnd = recurrence.endDate ? parsePlainDate(recurrence.endDate) : null
  const limit = hardEnd && Temporal.PlainDate.compare(hardEnd, rangeEnd) < 0 ? hardEnd : rangeEnd
  if (Temporal.PlainDate.compare(anchor, limit) >= 0) return []

  // Jump straight to the first occurrence at or after rangeStart instead of walking one step at
  // a time, so a task anchored years in the past doesn't take thousands of steps to reach today.
  let n = 1
  if (Temporal.PlainDate.compare(rangeStart, anchor) > 0) {
    const roughDays = ROUGH_UNIT_DAYS[recurrence.interval] * every
    n = Math.max(1, Math.floor(anchor.until(rangeStart, { largestUnit: 'days' }).days / roughDays))
    while (Temporal.PlainDate.compare(addRecurrenceUnit(anchor, recurrence.interval, every, n), rangeStart) < 0) {
      n++
    }
    while (
      n > 1 &&
      Temporal.PlainDate.compare(addRecurrenceUnit(anchor, recurrence.interval, every, n - 1), rangeStart) >= 0
    ) {
      n--
    }
  }

  const MAX_OCCURRENCES = 2000
  const occurrences: Temporal.PlainDate[] = []
  for (; occurrences.length < MAX_OCCURRENCES; n++) {
    const date = addRecurrenceUnit(anchor, recurrence.interval, every, n)
    if (Temporal.PlainDate.compare(date, limit) > 0) break
    occurrences.push(date)
  }
  return occurrences
}

/** Whether a finished task landed on its due date; null unless both dates are set. */
export function completionOutcome(due: string, completed: string): { text: string; tone: DueTone } | null {
  const dueDate = parsePlainDate(due)
  const completedDate = parsePlainDate(completed)
  if (!dueDate || !completedDate) return null
  const days = dueDate.until(completedDate, { largestUnit: 'day' }).days
  return { text: days > 0 ? `${days}d late` : 'On time', tone: 'outcome' }
}
