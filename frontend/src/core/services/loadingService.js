/**
 * loadingService.js — Global Application Loading Progress Bar Service
 * 
 * Manages top-loading bar progress states across API calls, tab switches, and async jobs.
 */

class LoadingService {
  constructor() {
    this.listeners = new Set();
    this.activeRequests = 0;
    this.progress = 0;
    this.isLoading = false;
    this.trickleTimer = null;
  }

  /**
   * Subscribe to loading state changes
   * @param {Function} callback ({ isLoading, progress }) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback({ isLoading: this.isLoading, progress: this.progress });
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all subscribed listeners
   */
  _notify() {
    const state = { isLoading: this.isLoading, progress: this.progress };
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('[LoadingService] Error in listener:', err);
      }
    });
  }

  /**
   * Start or increment loading state
   */
  start() {
    this.activeRequests++;
    if (this.activeRequests === 1) {
      this.isLoading = true;
      this.progress = 15;
      this._notify();
      this._startTrickle();
    }
  }

  /**
   * Incrementally increase progress while waiting
   */
  _startTrickle() {
    if (this.trickleTimer) clearInterval(this.trickleTimer);

    this.trickleTimer = setInterval(() => {
      if (this.progress < 85) {
        // Slow down increments as it reaches higher numbers
        const increment = Math.max(1, (90 - this.progress) * 0.1);
        this.progress = Math.min(88, this.progress + increment);
        this._notify();
      }
    }, 200);
  }

  /**
   * Stop trickle interval
   */
  _stopTrickle() {
    if (this.trickleTimer) {
      clearInterval(this.trickleTimer);
      this.trickleTimer = null;
    }
  }

  /**
   * Decrement active requests and finish when all complete
   */
  done() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      this._stopTrickle();
      this.progress = 100;
      this._notify();

      // Fade out after completion
      setTimeout(() => {
        if (this.activeRequests === 0) {
          this.isLoading = false;
          this.progress = 0;
          this._notify();
        }
      }, 350);
    }
  }

  /**
   * Force completion immediately
   */
  forceDone() {
    this.activeRequests = 0;
    this._stopTrickle();
    this.progress = 100;
    this._notify();

    setTimeout(() => {
      this.isLoading = false;
      this.progress = 0;
      this._notify();
    }, 350);
  }

  /**
   * Set custom progress percentage (0 - 100)
   */
  set(percent) {
    this.progress = Math.max(0, Math.min(100, percent));
    if (this.progress > 0 && !this.isLoading) {
      this.isLoading = true;
    }
    this._notify();
  }
}

export const loadingService = new LoadingService();
export default loadingService;
