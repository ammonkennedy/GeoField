/** A failed pass must survive a grace period and a subsequent check before display. */
export class SyncErrorGrace {
  private failedAt: number | null = null;
  private readonly delayMs = 5000;
  reset() { this.failedAt = null; }
  failure(now: number): { show: boolean; verifyAfter: number } {
    if (this.failedAt === null) this.failedAt = now;
    const remaining = Math.max(0, this.delayMs - (now - this.failedAt));
    return { show: remaining === 0, verifyAfter: remaining };
  }
}
