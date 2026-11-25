// Uploads the tracker's sessions to the website when there is a connection, and keeps them queued when there isn't.
// remote: {saveSegments(segments): Promise, heartbeat(info): Promise<{revoked?: boolean}>}
// Only matched game sessions are ever sent: the remote never sees the list of running programs.
'use strict';

class Sync {
  constructor({tracker, remote, clock, minDelayMs = 5000, maxDelayMs = 5 * 60000}) {
    this.tracker = tracker; this.remote = remote; this.clock = clock;
    this.minDelayMs = minDelayMs; this.maxDelayMs = maxDelayMs;
    this.busy = null; this.failures = 0; this.nextTry = 0; this.lastOk = 0; this.lastError = '';
  }
  get online() { return this.failures === 0; }

  // Send everything pending. Calls while an upload is running share it, so nothing is sent twice at once.
  flush({force = false} = {}) {
    if (this.busy) return this.busy;
    if (!force && this.clock.now() < this.nextTry) return Promise.resolve({skipped: 'backoff'});
    this.busy = (async () => {
      const {segments, revs} = this.tracker.pendingUpload();
      if (!segments.length) { this.failures = 0; return {sent: 0}; }
      try {
        await this.remote.saveSegments(segments);
        this.tracker.markUploaded(revs);
        this.failures = 0; this.nextTry = 0; this.lastOk = this.clock.now(); this.lastError = '';
        return {sent: segments.length};
      } catch (e) {
        this.failures++; this.lastError = String(e && e.message || e);
        this.nextTry = this.clock.now() + Math.min(this.maxDelayMs, this.minDelayMs * 2 ** (this.failures - 1));
        return {error: this.lastError};
      }
    })().finally(() => { this.busy = null; });
    return this.busy;
  }
}

module.exports = {Sync};
