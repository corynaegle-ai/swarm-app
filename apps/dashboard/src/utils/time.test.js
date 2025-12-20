/**
 * Unit tests for time utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRelativeTime } from './time.js';

describe('getRelativeTime', () => {
  // Use fake timers for consistent testing
  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed "now" time: January 15, 2024, 12:00:00 UTC
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('edge cases - null/undefined/invalid inputs', () => {
    it('should return empty string for null timestamp', () => {
      expect(getRelativeTime(null)).toBe('');
    });

    it('should return empty string for undefined timestamp', () => {
      expect(getRelativeTime(undefined)).toBe('');
    });

    it('should return empty string for invalid date string', () => {
      expect(getRelativeTime('not-a-date')).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(getRelativeTime('')).toBe('');
    });

    it('should return empty string for NaN', () => {
      expect(getRelativeTime(NaN)).toBe('');
    });

    it('should return empty string for invalid object', () => {
      expect(getRelativeTime({})).toBe('');
    });
  });

  describe('"just now" case (< 1 minute)', () => {
    it('should return "just now" for current time', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      expect(getRelativeTime(now)).toBe('just now');
    });

    it('should return "just now" for 0 seconds ago', () => {
      const timestamp = Date.now();
      expect(getRelativeTime(timestamp)).toBe('just now');
    });

    it('should return "just now" for 30 seconds ago', () => {
      const timestamp = Date.now() - 30 * 1000;
      expect(getRelativeTime(timestamp)).toBe('just now');
    });

    it('should return "just now" for 59 seconds ago', () => {
      const timestamp = Date.now() - 59 * 1000;
      expect(getRelativeTime(timestamp)).toBe('just now');
    });

    it('should return "just now" for ISO string timestamp just created', () => {
      expect(getRelativeTime('2024-01-15T12:00:00Z')).toBe('just now');
    });
  });

  describe('future dates', () => {
    it('should return "just now" for timestamps in the future', () => {
      const future = new Date('2024-01-15T12:05:00Z'); // 5 minutes in the future
      expect(getRelativeTime(future)).toBe('just now');
    });

    it('should return "just now" for far future dates', () => {
      const farFuture = new Date('2025-01-15T12:00:00Z'); // 1 year in the future
      expect(getRelativeTime(farFuture)).toBe('just now');
    });
  });

  describe('minutes case (1-59 minutes)', () => {
    it('should return "1min ago" for exactly 1 minute ago', () => {
      const timestamp = Date.now() - 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('1min ago');
    });

    it('should return "5min ago" for 5 minutes ago', () => {
      const timestamp = Date.now() - 5 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('5min ago');
    });

    it('should return "20min ago" for 20 minutes ago', () => {
      const timestamp = Date.now() - 20 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('20min ago');
    });

    it('should return "30min ago" for 30 minutes ago', () => {
      const timestamp = Date.now() - 30 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('30min ago');
    });

    it('should return "59min ago" for 59 minutes ago', () => {
      const timestamp = Date.now() - 59 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('59min ago');
    });

    it('should handle ISO string for minutes range', () => {
      expect(getRelativeTime('2024-01-15T11:45:00Z')).toBe('15min ago');
    });
  });

  describe('hours case (1-23 hours)', () => {
    it('should return "1hr ago" for exactly 1 hour ago', () => {
      const timestamp = Date.now() - 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('1hr ago');
    });

    it('should return "1hr ago" for 90 minutes ago (rounds down to hours)', () => {
      const timestamp = Date.now() - 90 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('1hr ago');
    });

    it('should return "3hr ago" for 3 hours ago', () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('3hr ago');
    });

    it('should return "12hr ago" for 12 hours ago', () => {
      const timestamp = Date.now() - 12 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('12hr ago');
    });

    it('should return "23hr ago" for 23 hours ago', () => {
      const timestamp = Date.now() - 23 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('23hr ago');
    });

    it('should handle ISO string for hours range', () => {
      expect(getRelativeTime('2024-01-15T06:00:00Z')).toBe('6hr ago');
    });
  });

  describe('days case (1-6 days)', () => {
    it('should return "1d ago" for exactly 24 hours ago', () => {
      const timestamp = Date.now() - 24 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('1d ago');
    });

    it('should return "1d ago" for 36 hours ago (rounds down to days)', () => {
      const timestamp = Date.now() - 36 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('1d ago');
    });

    it('should return "2d ago" for 2 days ago', () => {
      const timestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('2d ago');
    });

    it('should return "3d ago" for 3 days ago', () => {
      const timestamp = Date.now() - 3 * 24 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('3d ago');
    });

    it('should return "6d ago" for 6 days ago', () => {
      const timestamp = Date.now() - 6 * 24 * 60 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('6d ago');
    });

    it('should handle ISO string for days range', () => {
      expect(getRelativeTime('2024-01-13T12:00:00Z')).toBe('2d ago');
    });
  });

  describe('older dates (>= 7 days)', () => {
    it('should return formatted date for exactly 7 days ago', () => {
      const timestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const result = getRelativeTime(timestamp);
      // Should return a formatted date string, not "Xd ago"
      expect(result).not.toContain('d ago');
      expect(result).not.toContain('hr ago');
      expect(result).not.toContain('min ago');
    });

    it('should return formatted date for 14 days ago', () => {
      const timestamp = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const result = getRelativeTime(timestamp);
      expect(result).not.toContain('d ago');
    });

    it('should return formatted date for 30 days ago', () => {
      const timestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const result = getRelativeTime(timestamp);
      expect(result).not.toContain('d ago');
    });

    it('should return formatted date for 1 year ago', () => {
      const timestamp = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const result = getRelativeTime(timestamp);
      expect(result).not.toContain('d ago');
    });

    it('should handle very old dates', () => {
      const result = getRelativeTime('2020-01-01T00:00:00Z');
      expect(result).not.toContain('d ago');
      // Should be a date-like string
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('input types', () => {
    it('should handle Date object input', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      expect(getRelativeTime(date)).toBe('5min ago');
    });

    it('should handle Unix timestamp (number) input', () => {
      const timestamp = Date.now() - 5 * 60 * 1000;
      expect(getRelativeTime(timestamp)).toBe('5min ago');
    });

    it('should handle ISO string input', () => {
      expect(getRelativeTime('2024-01-15T11:55:00Z')).toBe('5min ago');
    });

    it('should handle date-only string input', () => {
      // 2024-01-14 is 1 day before our fixed "now" time
      const result = getRelativeTime('2024-01-14');
      // This might be parsed as midnight local time, so result varies
      // Just verify it returns something valid (not empty)
      expect(result).not.toBe('');
    });
  });

  describe('boundary conditions', () => {
    it('should transition correctly from seconds to minutes at 60 seconds', () => {
      const just59Sec = Date.now() - 59 * 1000;
      const exactly60Sec = Date.now() - 60 * 1000;
      const just61Sec = Date.now() - 61 * 1000;

      expect(getRelativeTime(just59Sec)).toBe('just now');
      expect(getRelativeTime(exactly60Sec)).toBe('1min ago');
      expect(getRelativeTime(just61Sec)).toBe('1min ago');
    });

    it('should transition correctly from minutes to hours at 60 minutes', () => {
      const just59Min = Date.now() - 59 * 60 * 1000;
      const exactly60Min = Date.now() - 60 * 60 * 1000;
      const just61Min = Date.now() - 61 * 60 * 1000;

      expect(getRelativeTime(just59Min)).toBe('59min ago');
      expect(getRelativeTime(exactly60Min)).toBe('1hr ago');
      expect(getRelativeTime(just61Min)).toBe('1hr ago');
    });

    it('should transition correctly from hours to days at 24 hours', () => {
      const just23Hr = Date.now() - 23 * 60 * 60 * 1000;
      const exactly24Hr = Date.now() - 24 * 60 * 60 * 1000;
      const just25Hr = Date.now() - 25 * 60 * 60 * 1000;

      expect(getRelativeTime(just23Hr)).toBe('23hr ago');
      expect(getRelativeTime(exactly24Hr)).toBe('1d ago');
      expect(getRelativeTime(just25Hr)).toBe('1d ago');
    });

    it('should transition correctly from days to formatted date at 7 days', () => {
      const just6Days = Date.now() - 6 * 24 * 60 * 60 * 1000;
      const exactly7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const just8Days = Date.now() - 8 * 24 * 60 * 60 * 1000;

      expect(getRelativeTime(just6Days)).toBe('6d ago');
      expect(getRelativeTime(exactly7Days)).not.toContain('d ago');
      expect(getRelativeTime(just8Days)).not.toContain('d ago');
    });
  });
});
