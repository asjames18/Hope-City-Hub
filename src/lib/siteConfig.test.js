import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_ICON_URL, getExternalHref, getSiteIconUrl, normalizePageConfig } from './siteConfig';

describe('siteConfig', () => {
  it('normalizes partial config and event payloads', () => {
    const normalized = normalizePageConfig({
      announcement: { text: 'Hello' },
      events: [
        {
          id: 'abc',
          title: 'Prayer Night',
          date: 'Apr 12',
          time: '7:00 PM',
          location_name: 'Hope City Highlands',
          location_address: '1700 Simpson Ave, Sebring, FL',
          signup_url: 'https://example.com',
        },
      ],
    });

    expect(normalized.announcement.text).toBe('Hello');
    expect(normalized.links.connectCard).toBeTruthy();
    expect(normalized.links.iconUrl).toBe('');
    expect(normalized.socials.website).toBe('https://hopecityhighlands.com');
    expect(normalized.events).toEqual([
      {
        id: 'abc',
        title: 'Prayer Night',
        date: 'Apr 12',
        time: '7:00 PM',
        location: 'Hope City Highlands, 1700 Simpson Ave, Sebring, FL',
        locationName: 'Hope City Highlands',
        locationAddress: '1700 Simpson Ave, Sebring, FL',
        signupUrl: 'https://example.com',
      },
    ]);
  });

  it('filters unusable external hrefs', () => {
    expect(getExternalHref(' https://example.com ')).toBe('https://example.com');
    expect(getExternalHref('#')).toBe('');
    expect(getExternalHref('')).toBe('');
  });

  it('uses the configured site icon URL with a built-in fallback', () => {
    expect(getSiteIconUrl({ links: { iconUrl: ' https://example.com/icon.png ' } })).toBe('https://example.com/icon.png');
    expect(getSiteIconUrl({ links: { iconUrl: '' } })).toBe(DEFAULT_SITE_ICON_URL);
  });
});
