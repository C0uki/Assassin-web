/** All sound effects are synthesized with WebAudio; no audio files. */
export class Synth {
  private noiseBuf: AudioBuffer;

  constructor(
    readonly ctx: AudioContext,
    private out: AudioNode,
  ) {
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; to?: number; at?: number; attack?: number; dest?: AudioNode } = {},
  ): void {
    const c = this.ctx;
    const t = opts.at ?? c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const vol = opts.vol ?? 0.1;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(
    dur: number,
    opts: { vol?: number; freq?: number; to?: number; type?: BiquadFilterType; q?: number; at?: number; dest?: AudioNode } = {},
  ): void {
    const c = this.ctx;
    const t = opts.at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    const vol = opts.vol ?? 0.1;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: string): void {
    const t = this.ctx.currentTime;
    switch (name) {
      case 'step':
        return this.noise(0.05, { freq: 900, vol: 0.12 });
      case 'stepSoft':
        return this.noise(0.035, { freq: 500, vol: 0.05 });
      case 'jump':
        this.noise(0.08, { freq: 1200, type: 'bandpass', vol: 0.08 });
        return;
      case 'land':
        return this.noise(0.12, { freq: 400, vol: 0.25 });
      case 'thud':
        this.noise(0.25, { freq: 220, vol: 0.5 });
        return this.tone(90, 0.25, { to: 40, vol: 0.3 });
      case 'climb':
        return this.noise(0.05, { freq: 1800, type: 'highpass', vol: 0.04 });
      case 'mantle':
        return this.noise(0.1, { freq: 800, type: 'bandpass', vol: 0.08 });
      case 'swing':
        return this.noise(0.13, { freq: 2600, to: 700, type: 'bandpass', q: 2, vol: 0.18 });
      case 'swingEnemy':
        return this.noise(0.15, { freq: 1500, to: 500, type: 'bandpass', q: 2, vol: 0.16 });
      case 'hit':
        this.noise(0.09, { freq: 1500, vol: 0.3 });
        return this.tone(150, 0.12, { to: 60, type: 'square', vol: 0.08 });
      case 'stab':
        this.tone(100, 0.2, { to: 45, vol: 0.25 });
        return this.noise(0.12, { freq: 2500, type: 'highpass', vol: 0.12 });
      case 'block':
        this.tone(900, 0.12, { type: 'triangle', vol: 0.12 });
        return this.tone(1350, 0.1, { type: 'triangle', vol: 0.06 });
      case 'parry':
        [1200, 1810, 2720].forEach((f, i) => this.tone(f, 0.5 - i * 0.1, { vol: 0.14 }));
        return this.noise(0.08, { freq: 4000, type: 'highpass', vol: 0.15 });
      case 'clink':
        return this.tone(2300, 0.06, { type: 'triangle', vol: 0.06 });
      case 'windup':
        return this.tone(320, 0.25, { to: 520, vol: 0.03 });
      case 'windupHeavy':
        return this.tone(140, 0.5, { to: 380, type: 'sawtooth', vol: 0.06 });
      case 'alert':
        this.tone(660, 0.12, { type: 'square', vol: 0.07 });
        return this.tone(990, 0.2, { type: 'square', vol: 0.07, at: t + 0.1 });
      case 'huh':
        return this.tone(520, 0.16, { to: 640, type: 'triangle', vol: 0.07 });
      case 'alarm':
        this.tone(880, 0.9, { vol: 0.08 });
        return this.tone(1320, 0.7, { vol: 0.05 });
      case 'scream':
        this.tone(900, 0.5, { to: 1400, type: 'sawtooth', vol: 0.05 });
        return this.tone(1300, 0.4, { to: 700, type: 'sawtooth', vol: 0.04, at: t + 0.15 });
      case 'panic':
        return this.noise(0.4, { freq: 1200, type: 'bandpass', q: 3, vol: 0.04 });
      case 'splash':
        return this.noise(0.45, { freq: 2500, to: 400, vol: 0.32 });
      case 'rustle':
        return this.noise(0.22, { freq: 3000, type: 'bandpass', vol: 0.08 });
      case 'throw':
        return this.noise(0.09, { freq: 2500, type: 'highpass', vol: 0.1 });
      case 'bow':
        this.tone(210, 0.12, { to: 120, type: 'triangle', vol: 0.1 });
        return this.noise(0.05, { freq: 3000, type: 'highpass', vol: 0.05 });
      case 'bowDraw':
        return this.noise(0.3, { freq: 1400, type: 'bandpass', q: 6, vol: 0.03 });
      case 'smoke':
        this.tone(120, 0.12, { to: 60, vol: 0.2 });
        return this.noise(0.7, { freq: 900, to: 300, vol: 0.25 });
      case 'pickup':
        return [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.18, { vol: 0.07, at: t + i * 0.06 }));
      case 'upgrade':
        return [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { vol: 0.07, type: 'triangle', at: t + i * 0.09 }));
      case 'target':
        this.tone(110, 1.6, { vol: 0.2 });
        return this.tone(165, 1.3, { vol: 0.1 });
      case 'save':
        this.tone(440, 0.3, { vol: 0.05 });
        return this.tone(660, 0.4, { vol: 0.05, at: t + 0.12 });
      case 'hurt':
        return this.tone(320, 0.18, { to: 150, type: 'square', vol: 0.08 });
      case 'death':
        return this.tone(220, 1.3, { to: 55, type: 'sawtooth', vol: 0.12 });
      case 'horn':
        this.tone(196, 0.8, { type: 'sawtooth', vol: 0.06, attack: 0.1 });
        return this.tone(233, 0.9, { type: 'sawtooth', vol: 0.06, attack: 0.1, at: t + 0.7 });
      case 'bump':
        return this.tone(300, 0.06, { type: 'triangle', vol: 0.05 });
      case 'drink':
        return [0, 0.15, 0.3].forEach((d) => this.noise(0.08, { freq: 700, type: 'bandpass', q: 4, vol: 0.06, at: t + d }));
      case 'heal':
        return [523, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { vol: 0.06, at: t + i * 0.07 }));
      case 'eat':
        this.noise(0.06, { freq: 1800, type: 'bandpass', vol: 0.08 });
        return this.tone(660, 0.2, { vol: 0.05, at: t + 0.08 });
      case 'bark':
        this.tone(420, 0.09, { to: 260, type: 'sawtooth', vol: 0.1 });
        this.noise(0.07, { freq: 900, type: 'bandpass', q: 2, vol: 0.1 });
        this.tone(440, 0.09, { to: 270, type: 'sawtooth', vol: 0.1, at: t + 0.16 });
        return this.noise(0.07, { freq: 900, type: 'bandpass', q: 2, vol: 0.1, at: t + 0.16 });
      case 'growl':
        return this.tone(90, 0.3, { to: 70, type: 'sawtooth', vol: 0.06 });
      case 'bite':
        this.noise(0.05, { freq: 2200, type: 'bandpass', vol: 0.12 });
        return this.tone(300, 0.06, { type: 'square', vol: 0.05 });
      case 'menu':
        return this.tone(660, 0.08, { type: 'triangle', vol: 0.06 });
    }
  }
}
