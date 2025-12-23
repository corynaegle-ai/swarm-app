import { formatRelativeTime, formatDate } from '../dateUtils';

// Mock Date.now() for consistent testing
const mockNow = new Date('2024-01-15T12:00:00Z');

beforeAll(() => {
  jest.spyOn(Date, 'now').mockImplementation(() => mockNow.getTime());
  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) {
        return mockNow;
      }
      return new (global.Date)(...args);
    }
    
    static now() {
      return mockNow.getTime();
    }
  };
});

aftterAll(() => {
  jest.restoreAllMocks();
});

describe('formatRelativeTime', () => {
  it('returns empty string for null/undefined input', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime(undefined)).toBe('');
    expect(formatRelativeTime('')).toBe('');
  });

  it('returns "Just now" for times within last minute', () => {
    const thirtySecondsAgo = new Date(mockNow.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('Just now');
  });

  it('returns minutes ago for times within last hour', () => {
    const fiveMinutesAgo = new Date(mockNow.getTime() - 5 * 60 * 1000).toISOString();
    const thirtyMinutesAgo = new Date(mockNow.getTime() - 30 * 60 * 1000).toISOString();
    
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
    expect(formatRelativeTime(thirtyMinutesAgo)).toBe('30 minutes ago');
  });

  it('handles singular minute correctly', () => {
    const oneMinuteAgo = new Date(mockNow.getTime() - 1 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
  });

  it('returns hours ago for times within last day', () => {
    const twoHoursAgo = new Date(mockNow.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const twelveHoursAgo = new Date(mockNow.getTime() - 12 * 60 * 60 * 1000).toISOString();
    
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
    expect(formatRelativeTime(twelveHoursAgo)).toBe('12 hours ago');
  });

  it('handles singular hour correctly', () => {
    const oneHourAgo = new Date(mockNow.getTime() - 1 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns days ago for times within last week', () => {
    const threeDaysAgo = new Date(mockNow.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const sixDaysAgo = new Date(mockNow.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    expect(formatRelativeTime(sixDaysAgo)).toBe('6 days ago');
  });

  it('handles singular day correctly', () => {
    const oneDayAgo = new Date(mockNow.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
  });

  it('returns weeks ago for times within last month', () => {
    const twoWeeksAgo = new Date(mockNow.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoWeeksAgo)).toBe('2 weeks ago');
  });

  it('returns months ago for times within last year', () => {
    const twoMonthsAgo = new Date(mockNow.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoMonthsAgo)).toBe('2 months ago');
  });

  it('returns years ago for very old dates', () => {
    const twoYearsAgo = new Date(mockNow.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoYearsAgo)).toBe('2 years ago');
  });
});

describe('formatDate', () => {
  it('returns empty string for null/undefined input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats date correctly', () => {
    const testDate = '2024-01-15T12:30:00Z';
    const formatted = formatDate(testDate);
    
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });
});