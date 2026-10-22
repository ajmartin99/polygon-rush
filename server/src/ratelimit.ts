/** Fixed-window counters per key (IP hash, email hash, account...). In memory: fine for one instance. */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private hits = new Map<string, { n: number; until: number }>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Count a hit; false when over the limit. */
  hit(key: string, now = Date.now()): boolean {
    let h = this.hits.get(key);
    if (!h || h.until <= now) {
      h = { n: 0, until: now + this.windowMs };
      this.hits.set(key, h);
    }
    h.n++;
    if (this.hits.size > 50_000) this.sweep(now);
    return h.n <= this.limit;
  }

  /** Still under the limit (without counting a hit). */
  peek(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    return !h || h.until <= now || h.n < this.limit;
  }

  sweep(now = Date.now()): void {
    for (const [k, h] of this.hits) if (h.until <= now) this.hits.delete(k);
  }
}
