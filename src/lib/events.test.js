import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCalendarLink, buildMapsLink, parseEventDateTime } from './events';

describe('events utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses timed events and reports time awareness', () => {
    const parsed = parseEventDateTime('Apr 12', '7:30 PM');

    expect(parsed).not.toBeNull();
    expect(parsed?.hasTime).toBe(true);
    expect(parsed?.start.getMonth()).toBe(3);
    expect(parsed?.start.getDate()).toBe(12);
  });

  it('rolls past dates into the next year', () => {
    const parsed = parseEventDateTime('Jan 10', '9:00 AM');

    expect(parsed?.start.getFullYear()).toBe(2027);
  });

  it('builds a downloadable ICS link', () => {
    const calendarLink = buildCalendarLink({
      title: 'Sunday Gathering',
      date: 'Apr 12',
      time: '10:00 AM',
      location: '123 Church St, Sebring, FL',
      signupUrl: 'https://example.com/signup',
    });

    expect(calendarLink).not.toBeNull();
    expect(calendarLink?.filename).toContain('sunday-gathering');
    expect(decodeURIComponent(calendarLink?.href || '')).toContain('BEGIN:VCALENDAR');
    expect(decodeURIComponent(calendarLink?.href || '')).toContain('SUMMARY:Sunday Gathering');
    expect(decodeURIComponent(calendarLink?.href || '')).toContain('LOCATION:123 Church St\\, Sebring\\, FL');
    expect(decodeURIComponent(calendarLink?.href || '')).toContain('Location: 123 Church St\\, Sebring\\, FL');
  });

  it('omits calendar location when event location is blank', () => {
    const calendarLink = buildCalendarLink({
      title: 'Prayer Night',
      date: 'Apr 12',
      time: '7:00 PM',
      location: '',
    });
    const ics = decodeURIComponent(calendarLink?.href || '');

    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('Location:');
  });

  it('builds a maps link for event locations', () => {
    expect(buildMapsLink('123 Church St, Sebring, FL')).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Church%20St%2C%20Sebring%2C%20FL'
    );
    expect(buildMapsLink('')).toBe('');
  });
});
