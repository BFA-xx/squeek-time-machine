"use client";

/**
 * All sound is generated in the browser. There are no audio files or licensed music.
 * Nothing starts until the visitor turns sound on, which also satisfies autoplay rules.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private rpm = 0;

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  enable(volume: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    void ctx.resume();
    this.master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.8);
    if (!this.ambience) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.value = 0.32;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();
      src.connect(lp).connect(g).connect(this.master);
      src.start();
      this.ambience = src;
    }
    this.scheduleClick();
  }

  disable() {
    if (!this.ctx || !this.master) return;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
    if (this.clickTimer) clearTimeout(this.clickTimer);
    this.clickTimer = null;
  }

  setVolume(v: number) {
    if (this.ctx && this.master) this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.1);
  }

  /** The wheel ticks at the measured RPM, and goes silent when the wheel really is still. */
  setRpm(rpm: number) {
    this.rpm = rpm;
  }

  private rideOsc: OscillatorNode | null = null;
  private rideGain: GainNode | null = null;

  /** A rising motor note while running on a wheel. Silent at 0. */
  setRide(intensity: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    if (!this.rideOsc) {
      this.rideOsc = ctx.createOscillator();
      this.rideOsc.type = "sawtooth";
      this.rideGain = ctx.createGain();
      this.rideGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      this.rideOsc.connect(lp).connect(this.rideGain).connect(this.master);
      this.rideOsc.start();
    }
    this.rideOsc.frequency.setTargetAtTime(50 + intensity * 340, ctx.currentTime, 0.08);
    this.rideGain!.gain.setTargetAtTime(intensity > 0.01 ? 0.03 + intensity * 0.11 : 0, ctx.currentTime, 0.08);
  }

  private scheduleClick() {
    if (this.clickTimer) clearTimeout(this.clickTimer);
    const tick = () => {
      if (this.rpm > 0.5) this.blip(1400, 0.015, 0.05);
      const every = this.rpm > 0.5 ? Math.max(70, 60_000 / (this.rpm * 8)) : 400;
      this.clickTimer = setTimeout(tick, every);
    };
    tick();
  }

  private blip(freq: number, dur: number, gain: number, type: OscillatorType = "square", endFreq?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  portal() {
    this.blip(180, 0.5, 0.14, "sine", 620);
  }
  select() {
    this.blip(760, 0.09, 0.05, "triangle");
  }
  discovery() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.32, 0.08, "sine"), i * 110));
  }
}

export const audio = typeof window === "undefined" ? (null as unknown as AudioEngine) : new AudioEngine();
