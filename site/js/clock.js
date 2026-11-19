export class Clock {
  constructor({ min = 0, max = 1, day = 0 } = {}) {
    this.min = min;
    this.max = max;
    this.day = clamp(day, min, max);
    this.speed = 1;
    this.playing = false;
    this._listeners = new Set();
    this._raf = 0;
    this._last = 0;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    fn(this);
    return () => this._listeners.delete(fn);
  }

  emit() {
    for (const fn of this._listeners) fn(this);
  }

  setDay(day) {
    const next = clamp(day, this.min, this.max);
    if (next === this.day) return;
    this.day = next;
    this.emit();
  }

  setSpeed(speed) {
    this.speed = clamp(Number(speed) || 1, 0.25, 4);
    this.emit();
  }

  play() {
    if (this.playing) return;
    if (this.day >= this.max - 0.05) this.day = this.min;
    this.playing = true;
    this._last = 0;
    const span = this.max - this.min;
    const step = (ts) => {
      if (!this.playing) return;
      if (!this._last) this._last = ts;
      const dt = Math.min(0.05, (ts - this._last) / 1000);
      this._last = ts;
      this.day += dt * this.speed * (span / 24);
      if (this.day >= this.max) {
        this.day = this.max;
        this.playing = false;
        this.emit();
        return;
      }
      this.emit();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.emit();
  }

  restart() {
    this.pause();
    this.day = this.min;
    this.play();
  }

  reset() {
    this.pause();
    this.day = this.min;
    this.emit();
  }
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
