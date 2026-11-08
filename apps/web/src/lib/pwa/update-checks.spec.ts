import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchForUpdates } from './update-checks';

class FakeRegistration {
  checks = 0;
  async update() {
    this.checks++;
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'hidden';
  show() {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }
  hide() {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

describe('watchForUpdates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks for a new version when the user comes back to the app', () => {
    const registration = new FakeRegistration();
    const source = new FakeDocument();
    watchForUpdates(registration, { source });

    source.hide();
    expect(registration.checks).toBe(0);
    source.show();
    expect(registration.checks).toBe(1);
  });

  it('also checks periodically, and stops when asked', () => {
    const registration = new FakeRegistration();
    const stop = watchForUpdates(registration, { source: new FakeDocument(), intervalMs: 1000 });

    vi.advanceTimersByTime(3000);
    expect(registration.checks).toBe(3);
    stop();
    vi.advanceTimersByTime(3000);
    expect(registration.checks).toBe(3);
  });
});
