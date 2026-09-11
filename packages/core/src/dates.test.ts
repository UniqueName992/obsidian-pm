import { afterEach, describe, expect, it, vi } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import type { Recurrence } from './types'
import { completionOutcome, formatDate, formatDateLong, formatDateShort, recurrenceOccurrences, relativeDue } from './dates'

const from = Temporal.PlainDate.from('2026-06-15')

describe('relativeDue', () => {
  it('returns null for empty or invalid dates', () => {
    expect(relativeDue('', from)).toBeNull()
    expect(relativeDue('not-a-date', from)).toBeNull()
  })

  it('flags overdue dates with the day count', () => {
    expect(relativeDue('2026-06-13', from)).toEqual({ text: '2d overdue', tone: 'overdue' })
    expect(relativeDue('2026-06-14', from)).toEqual({ text: '1d overdue', tone: 'overdue' })
  })

  it('labels today and tomorrow', () => {
    expect(relativeDue('2026-06-15', from)).toEqual({ text: 'Today', tone: 'today' })
    expect(relativeDue('2026-06-16', from)).toEqual({ text: 'Tomorrow', tone: 'today' })
  })

  it('labels dates within the week', () => {
    expect(relativeDue('2026-06-18', from)).toEqual({ text: 'In 3d', tone: 'soon' })
    expect(relativeDue('2026-06-21', from)).toEqual({ text: 'In 6d', tone: 'soon' })
  })

  it('returns null beyond a week out', () => {
    expect(relativeDue('2026-06-22', from)).toBeNull()
    expect(relativeDue('2026-12-01', from)).toBeNull()
  })
})

describe('completionOutcome', () => {
  it('returns null unless both dates are set', () => {
    expect(completionOutcome('', '2026-06-15')).toBeNull()
    expect(completionOutcome('2026-06-15', '')).toBeNull()
    expect(completionOutcome('not-a-date', '2026-06-15')).toBeNull()
  })

  it('counts the days a task ran past its due date', () => {
    expect(completionOutcome('2026-06-15', '2026-06-18')).toEqual({ text: '3d late', tone: 'outcome' })
    expect(completionOutcome('2026-06-15', '2026-06-16')).toEqual({ text: '1d late', tone: 'outcome' })
  })

  it('reads on time when the task landed on or before its due date', () => {
    expect(completionOutcome('2026-06-15', '2026-06-15')).toEqual({ text: 'On time', tone: 'outcome' })
    expect(completionOutcome('2026-06-15', '2026-06-01')).toEqual({ text: 'On time', tone: 'outcome' })
  })
})

describe('recurrenceOccurrences', () => {
  const anchor = Temporal.PlainDate.from('2026-06-15')
  const iso = (dates: Temporal.PlainDate[]) => dates.map((d) => d.toString())

  it('steps forward by the interval and every-N multiplier', () => {
    const weekly: Recurrence = { interval: 'weekly', every: 2 }
    const rangeEnd = Temporal.PlainDate.from('2026-07-15')
    expect(iso(recurrenceOccurrences(weekly, anchor, anchor, rangeEnd))).toEqual([
      '2026-06-29',
      '2026-07-13'
    ])
  })

  it('handles monthly intervals, clamping to the last day of short months', () => {
    const monthly: Recurrence = { interval: 'monthly', every: 1 }
    const jan31 = Temporal.PlainDate.from('2026-01-31')
    expect(iso(recurrenceOccurrences(monthly, jan31, jan31, Temporal.PlainDate.from('2026-05-01')))).toEqual([
      '2026-02-28', // clamped: 2026 isn't a leap year
      '2026-03-31',
      '2026-04-30' // clamped: April has 30 days
    ])
  })

  it('stops at the recurrence end date even when the display range runs longer', () => {
    const daily: Recurrence = { interval: 'daily', every: 1, endDate: '2026-06-18' }
    expect(iso(recurrenceOccurrences(daily, anchor, anchor, Temporal.PlainDate.from('2026-07-01')))).toEqual([
      '2026-06-16',
      '2026-06-17',
      '2026-06-18'
    ])
  })

  it('skips occurrences before rangeStart without walking each one from a distant anchor', () => {
    const daily: Recurrence = { interval: 'daily', every: 1 }
    const longAgo = Temporal.PlainDate.from('2020-01-01')
    const rangeStart = Temporal.PlainDate.from('2026-06-10')
    const rangeEnd = Temporal.PlainDate.from('2026-06-12')
    expect(iso(recurrenceOccurrences(daily, longAgo, rangeStart, rangeEnd))).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12'
    ])
  })

  it('returns nothing once the anchor is already past the range', () => {
    const daily: Recurrence = { interval: 'daily', every: 1 }
    expect(recurrenceOccurrences(daily, anchor, anchor, Temporal.PlainDate.from('2026-06-01'))).toEqual([])
  })

  it('treats every 0 or negative as every 1', () => {
    const weekly: Recurrence = { interval: 'weekly', every: 0 }
    expect(iso(recurrenceOccurrences(weekly, anchor, anchor, Temporal.PlainDate.from('2026-06-30')))).toEqual([
      '2026-06-22',
      '2026-06-29'
    ])
  })
})

describe('date formatting', () => {
  const ZONES = ['UTC', 'America/New_York', 'Pacific/Kiritimati']

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns an empty string for empty or invalid dates', () => {
    expect(formatDate('')).toBe('')
    expect(formatDateShort('not-a-date')).toBe('')
    expect(formatDateLong('')).toBe('')
  })

  // A YYYY-MM-DD field names a calendar day, not an instant: read as an instant it lands on
  // the day before wherever the clock is behind UTC.
  it.each(ZONES)('names the day the field says in %s', (zone) => {
    vi.stubEnv('TZ', zone)
    expect(formatDate('2026-03-28')).toContain('28')
    expect(formatDateShort('2026-03-28')).toContain('28')
    expect(formatDateLong('2026-03-28')).toContain('28')
  })
})
