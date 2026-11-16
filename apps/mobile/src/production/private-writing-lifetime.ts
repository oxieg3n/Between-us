export const PRIVATE_WRITING_IDLE_MS = 2 * 60 * 1000;

export type PrivateWritingLifetimePorts = {
  current(): boolean;
  monotonicNow(): number;
  attempted(): boolean;
  clearUnsent(): void;
  invalidateDraftHandlers(): void;
  discardUnattemptedReview(): void;
  hideAttemptedReview(): void;
};

/** Bind one coordinator to one verified author/session lifetime, including Home and Review. */
export function createPrivateWritingLifetime(ports: PrivateWritingLifetimePorts) {
  let cancelled = false, locked = false, clock = ports.monotonicNow(), lastInput = clock;
  const current = () => !cancelled && ports.current();
  const now = () => (clock = Math.max(clock, ports.monotonicNow()));
  const lock = () => {
    if (!current() || locked) return false;
    locked = true;
    ports.clearUnsent();
    if (!current()) return true;
    ports.invalidateDraftHandlers();
    if (!current()) return true;
    if (ports.attempted()) ports.hideAttemptedReview();
    else ports.discardUnattemptedReview();
    return true;
  };
  return {
    // Only actual author edits call touch; it never restores or unhides an attempted review.
    touch() {
      if (!current()) return false;
      const time = now();
      // Delayed timers cannot let the first overdue edit revive expired writing.
      if (!locked && time - lastInput >= PRIVATE_WRITING_IDLE_MS) { lock(); return false; }
      lastInput = time; locked = false; return true;
    },
    lock,
    tick() {
      if (!current() || locked || now() - lastInput < PRIVATE_WRITING_IDLE_MS) return false;
      return lock();
    },
    cancel() { cancelled = true; },
  };
}
