import { describe, it, expect, beforeEach, vi } from 'vitest';
import loadingService from './loadingService.js';

describe('loadingService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadingService.forceDone();
    vi.advanceTimersByTime(400);
  });

  it('initializes with default idle state', () => {
    expect(loadingService.isLoading).toBe(false);
    expect(loadingService.progress).toBe(0);
    expect(loadingService.activeRequests).toBe(0);
  });

  it('starts loading and increments progress', () => {
    loadingService.start();
    expect(loadingService.isLoading).toBe(true);
    expect(loadingService.progress).toBe(15);
    expect(loadingService.activeRequests).toBe(1);

    // Advance trickle timer
    vi.advanceTimersByTime(400);
    expect(loadingService.progress).toBeGreaterThan(15);
  });

  it('handles multiple concurrent requests correctly', () => {
    loadingService.start();
    loadingService.start();
    expect(loadingService.activeRequests).toBe(2);

    loadingService.done();
    expect(loadingService.activeRequests).toBe(1);
    expect(loadingService.isLoading).toBe(true);
    expect(loadingService.progress).toBeLessThan(100);

    loadingService.done();
    expect(loadingService.activeRequests).toBe(0);
    expect(loadingService.progress).toBe(100);

    vi.advanceTimersByTime(400);
    expect(loadingService.isLoading).toBe(false);
    expect(loadingService.progress).toBe(0);
  });

  it('notifies subscribers on state changes', () => {
    const subscriber = vi.fn();
    const unsubscribe = loadingService.subscribe(subscriber);

    expect(subscriber).toHaveBeenCalledWith({ isLoading: false, progress: 0 });

    loadingService.start();
    expect(subscriber).toHaveBeenCalledWith({ isLoading: true, progress: 15 });

    unsubscribe();
    loadingService.done();
    // After unsubscribe, subscriber shouldn't be called again
    const callCount = subscriber.mock.calls.length;
    loadingService.start();
    expect(subscriber.mock.calls.length).toBe(callCount);
  });
});
