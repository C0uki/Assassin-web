import { volumeGain } from '../systems/settings';
import { Music, MusicMode } from './music';
import { Synth } from './sfx';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

/** Lazily created on the first key press (browsers block audio before a user gesture). */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private synth: Synth | null = null;
  private music: Music | null = null;
  private wantMode: MusicMode = 'none';
  private volumes: Volumes = { master: 8, music: 7, sfx: 8 };
  muted = false;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.applyGains(true);
      this.synth = new Synth(this.ctx, this.sfxBus);
      this.music = new Music(new Synth(this.ctx, this.musicBus), this.musicBus);
      this.music.setMode(this.wantMode);
    } catch {
      this.ctx = null;
    }
  }

  private applyGains(immediate = false): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const set = (node: GainNode, v: number): void => {
      if (immediate) node.gain.value = v;
      else node.gain.setTargetAtTime(v, t, 0.03);
    };
    set(this.master, this.muted ? 0 : volumeGain(this.volumes.master));
    set(this.sfxBus, volumeGain(this.volumes.sfx));
    set(this.musicBus, volumeGain(this.volumes.music));
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyGains();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyGains();
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
