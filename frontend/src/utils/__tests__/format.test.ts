import { describe, expect, it } from 'vitest'
import { formatLapTime, parseLapTime } from '../format'

describe('formatLapTime / parseLapTime', () => {
  it('formats ms as m:ss.mmm', () => {
    expect(formatLapTime(81200)).toBe('1:21.200')
    expect(formatLapTime(92850)).toBe('1:32.850')
    expect(formatLapTime(60000)).toBe('1:00.000')
    expect(formatLapTime(0)).toBe('0:00.000')
    expect(formatLapTime(75333)).toBe('1:15.333')
  })

  it('matches the contract regex ^\\d{1,2}:[0-5]\\d\\.\\d{3}$', () => {
    const re = /^\d{1,2}:[0-5]\d\.\d{3}$/
    for (const ms of [81200, 92850, 60000, 0, 115000, 75333]) {
      expect(re.test(formatLapTime(ms))).toBe(true)
    }
  })

  it('parses back to the exact ms (round trip)', () => {
    for (const ms of [81200, 92850, 60000, 0, 115000, 75333]) {
      expect(parseLapTime(formatLapTime(ms))).toBe(ms)
    }
  })

  it('returns NaN for malformed strings', () => {
    expect(parseLapTime('not a time')).toBeNaN()
    expect(parseLapTime('1:60.000')).toBeNaN()
    expect(parseLapTime('1:21.2')).toBeNaN()
    expect(parseLapTime('')).toBeNaN()
  })
})
