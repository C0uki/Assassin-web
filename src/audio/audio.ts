import { Music, MusicMode } from './music';
import { Synth } from './sfx';

/** Lazily created on the first key press (browsers block audio before a user gesture). */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private synth: Synth | null = null;
  private music: Music | null = null;
  private wantMode: MusicMode = 'none';
  muted = false;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const sfx = this.ctx.createGain();
      sfx.connect(this.master);
      const mus = this.ctx.createGain();
      mus.gain.value = 0.7;
      mus.connect(this.master);
      this.synth = new Synth(this.ctx, sfx);
      this.music = new Music(new Synth(this.ctx, mus), mus);
      this.music.setMode(this.wantMode);
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  play(name: string): void {
    if (!this.synth || this.muted) return;
    try {
      this.synth.play(name);
    } catch {
      // ignore audio glitches
    }
  }

  setMusic(mode: MusicMode): void {
    this.wantMode = mode;
    this.music?.setMode(mode);
  }

  update(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.music?.update();
  }
}
