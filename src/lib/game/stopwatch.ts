/** Cronómetro de tiempo jugado: se pausa cuando la pestaña no está visible. */
export class Stopwatch {
  private base: number;
  private since: number | null = null;

  constructor(initialMs = 0) {
    this.base = initialMs;
  }

  start() {
    if (this.since === null) this.since = performance.now();
  }

  pause() {
    if (this.since !== null) {
      this.base += performance.now() - this.since;
      this.since = null;
    }
  }

  get running() {
    return this.since !== null;
  }

  get ms(): number {
    return this.base + (this.since !== null ? performance.now() - this.since : 0);
  }
}
