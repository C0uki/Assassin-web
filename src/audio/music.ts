import type { Synth } from './sfx';

export type MusicMode = 'none' | 'explore' | 'combat';

// D "Hijaz" scale: D Eb F# G A Bb C D
const SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16];
const ROOT = 146.83; // D3
const freq = (deg: number, oct = 0): number => ROOT * Math.pow(2, (SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + 12 * oct) / 12);

// Melody degrees per 8th note, -1 = rest.
const EXPLORE_MELODY = [4, -1, 5, 4, 2, -1, 1, 2, 4, -1, -1, 2, 1, 0, -1, -1, 3, -1, 4, 5, 6, -1, 5, 4, 2, 4, 2, 1, 0, -1, -1, -1];
const COMBAT_BASS = [0, 0, -1, 0, 1, -1, 0, -1, 0, 0, -1, 0, 3, -1, 1, -1];
const COMBAT_LEAD = [7, -1, 6, 7, -1, 5, -1, 4, 7, -1, 8, 7, 6, 5, 4, 2];

interface Track {
  stepDur: number;
  steps: number;
  play(step: number, at: number): void;
}

export class Music {
  mode: MusicMode = 'none';
  private next = 0;
  private step = 0;
  private drone: { stop(): void } | null = null;

  constructor(
    private synth: Synth,
    private out: GainNode,
  ) {}

  private tracks(): Record<Exclude<MusicMode, 'none'>, Track> {
    const s = this.synth;
    const out = this.out;
    const drum = (at: number, low: boolean): void => {
      if (low) {
        s.tone(85, 0.25, { to: 50, vol: 0.18, at, dest: out });
        s.noise(0.08, { freq: 300, vol: 0.08, at, dest: out });
      } else s.noise(0.05, { freq: 2500, type: 'bandpass', q: 2, vol: 0.08, at, dest: out });
    };
    const pluck = (f: number, at: number, vol: number, dur = 0.5): void => {
      s.tone(f, dur, { type: 'triangle', vol, at, dest: out });
      s.tone(f * 2, dur * 0.4, { type: 'sine', vol: vol * 0.3, at, dest: out });
    };
    return {
      explore: {
        stepDur: 60 / 84 / 2,
        steps: 32,
        play: (st, at) => {
          const m = EXPLORE_MELODY[st];
          if (m >= 0) pluck(freq(m, 1), at, 0.05, 0.7);
          if (st % 8 === 0) drum(at, true);
          if (st % 8 === 3 || st % 8 === 6) drum(at, false);
        },
      },
      combat: {
        stepDur: 60 / 136 / 2,
        steps: 16,
        play: (st, at) => {
          const b = COMBAT_BASS[st];
          if (b >= 0) s.tone(freq(b, -1), 0.22, { type: 'sawtooth', vol: 0.05, at, dest: out });
          const l = COMBAT_LEAD[st];
          if (l >= 0 && st % 2 === 0) pluck(freq(l, 1), at, 0.04, 0.25);
          if (st % 8 === 0 || st === 11) drum(at, true);
          if ([3, 6, 10, 12, 14].includes(st)) drum(at, false);
        },
      },
    };
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    this.next = this.synth.ctx.currentTime + 0.05;
    this.drone?.stop();
    this.drone = null;
    if (mode !== 'none') this.drone = this.startDrone(mode === 'combat' ? 0.025 : 0.035);
  }

  private startDrone(vol: number): { stop(): void } {
    const c = this.synth.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 1.5);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const oscs = [ROOT / 2, (ROOT / 2) * 1.5].map((fr) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g).connect(this.out);
    return {
      stop: () => {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        oscs.forEach((o) => o.stop(t + 0.9));
      },
    };
  }

  update(): void {
    if (this.mode === 'none') return;
    const track = this.tracks()[this.mode];
    const now = this.synth.ctx.currentTime;
    if (this.next < now - 0.5) this.next = now + 0.05;
    while (this.next < now + 0.15) {
      track.play(this.step, this.next);
      this.step = (this.step + 1) % track.steps;
      this.next += track.stepDur;
    }
  }
}
