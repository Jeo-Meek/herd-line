export class AudioDirector {
  private ctx: AudioContext | null = null;
  private baas = 0;
  muted = false;

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.06, slide = 0): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  enter(combo: number): void {
    const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
    const step = pentatonic[Math.min(this.baas === 99 ? 0 : combo - 1, pentatonic.length - 1)] ?? 0;
    this.tone(420 * Math.pow(2, step / 12), 0.16, "triangle", 0.07);
  }

  baa(): void {
    if (this.baas >= 6) return;
    this.baas++;
    this.tone(320 + Math.random() * 40, 0.12, "sawtooth", 0.03, -80);
    window.setTimeout(() => this.baas--, 180);
  }

  fence(): void {
    this.tone(140, 0.12, "square", 0.05, -40);
  }

  shatter(): void {
    this.tone(180, 0.18, "square", 0.04, -120);
  }

  wolfWarn(): void {
    this.tone(180, 0.45, "sawtooth", 0.06, -90);
  }

  wolfHit(): void {
    this.tone(90, 0.2, "square", 0.08);
    this.tone(520, 0.12, "triangle", 0.04);
  }

  inkEmpty(): void {
    this.tone(200, 0.15, "triangle", 0.05, -100);
  }

  star(n: number): void {
    this.tone(520 + n * 80, 0.2, "sine", 0.06);
  }

  tick(): void {
    this.tone(880, 0.04, "square", 0.03);
  }
}

export const audio = new AudioDirector();
