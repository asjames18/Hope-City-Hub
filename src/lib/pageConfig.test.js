import { beforeEach, describe, expect, it } from 'vitest';
import { getPageConfig, savePageConfig } from './pageConfig';

describe('pageConfig storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores versioned normalized config payloads', () => {
    savePageConfig({
      announcement: { text: 'Updated banner' },
      events: [{ title: 'Night of Worship', date: 'Apr 12', time: '7:00 PM' }],
    });

    const stored = JSON.parse(localStorage.getItem('hopeCity_pageConfig'));
    expect(stored.version).toBe(3);
    expect(stored.meta.cacheKey).toBeTruthy();
    expect(stored.data.announcement.text).toBe('Updated banner');
    expect(stored.data.links.connectCard).toBeTruthy();
    expect(stored.data.events[0].signupUrl).toBe('');
  });

  it('drops very stale caches when stale data is not allowed', () => {
    localStorage.setItem('hopeCity_pageConfig', JSON.stringify({
      version: 3,
      savedAt: '2020-01-01T00:00:00.000Z',
      meta: { cacheKey: 'old-cache-key' },
      data: {
        announcement: { text: 'Old banner' },
      },
    }));

    const config = getPageConfig({ allowStale: false });
    expect(config.announcement.text).not.toBe('Old banner');
  });
});
