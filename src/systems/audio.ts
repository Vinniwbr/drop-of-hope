import { readStorage, writeStorage } from '../utils';

/**
 * Audio 100% procedural (Web Audio API): nenhum arquivo de som e necessario,
 * entao nao ha licenca a cuidar nem peso extra no GitHub Pages.
 */
export type SfxName =
  | 'attack'
  | 'boss-charge'
  | 'boss-defeat'
  | 'boss-hit'
  | 'checkpoint'
  | 'click'
  | 'collect'
  | 'dash'
  | 'death'
  | 'enemy-die'
  | 'gate'
  | 'heal'
  | 'hit'
  | 'hurt'
  | 'jump'
  | 'land'
  | 'nova'
  | 'shard'
  | 'shoot'
  | 'stomp'
  | 'win';

export type MusicMode = 'boss' | 'explore' | 'menu';

const MUTE_KEY = 'drop-off-hope:muted:v1';
const PENTATONIC = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];

class AudioBus {
  private context?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private musicToken = 0;
  private muted = readStorage(MUTE_KEY) === '1';
  private noiseBuffer?: AudioBuffer;
  private currentMusic = '';

  get isMuted() {
    return this.muted;
  }

  /** Precisa ser chamado dentro de um clique/toque (regra dos navegadores). */
  unlock() {
    if (!this.context) {
      const legacy = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = legacy.AudioContext ?? legacy.webkitAudioContext;
      if (!Ctor) {
        return;
      }
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);

      const length = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, length, length);
      const data = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index++) {
        data[index] = Math.random() * 2 - 1;
      }
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeStorage(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.8,
        this.context.currentTime,
        0.05,
      );
    }
    return this.muted;
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    destination?: AudioNode,
  ) {
    const context = this.context;
    if (!context || !this.master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, to),
        start + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(destination ?? this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private noise(
    duration: number,
    volume: number,
    frequency: number,
    type: BiquadFilterType,
    delay = 0,
  ) {
    const context = this.context;
    if (!context || !this.master || !this.noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.05);
  }

  sfx(name: SfxName) {
    if (!this.context || this.muted) return;
    switch (name) {
      case 'jump':
        this.tone(260, 560, 0.16, 'sine', 0.16);
        break;
      case 'land':
        this.noise(0.09, 0.22, 500, 'lowpass');
        break;
      case 'dash':
        this.noise(0.18, 0.18, 1400, 'bandpass');
        this.tone(500, 180, 0.15, 'triangle', 0.08);
        break;
      case 'attack':
        this.noise(0.13, 0.2, 2600, 'bandpass');
        this.tone(520, 200, 0.1, 'triangle', 0.1);
        break;
      case 'shoot':
        this.tone(760, 300, 0.16, 'sawtooth', 0.09);
        this.noise(0.06, 0.1, 1800, 'highpass');
        break;
      case 'hit':
        this.tone(220, 80, 0.12, 'square', 0.16);
        this.noise(0.08, 0.18, 900, 'bandpass');
        break;
      case 'stomp':
        this.tone(320, 110, 0.14, 'square', 0.16);
        break;
      case 'enemy-die':
        this.tone(300, 60, 0.25, 'sawtooth', 0.14);
        this.noise(0.2, 0.15, 700, 'lowpass');
        break;
      case 'hurt':
        this.tone(320, 90, 0.32, 'sawtooth', 0.22);
        this.noise(0.15, 0.2, 500, 'lowpass');
        break;
      case 'collect':
        this.tone(880 + Math.random() * 120, 1320, 0.1, 'sine', 0.13);
        break;
      case 'heal':
        [440, 554, 660, 880].forEach((frequency, index) => {
          this.tone(frequency, frequency, 0.16, 'sine', 0.13, index * 0.07);
        });
        break;
      case 'shard':
        [523, 659, 784, 1047, 1319].forEach((frequency, index) => {
          this.tone(frequency, frequency, 0.22, 'triangle', 0.14, index * 0.08);
        });
        break;
      case 'checkpoint':
        this.tone(330, 660, 0.35, 'sine', 0.15);
        this.tone(495, 990, 0.35, 'sine', 0.1, 0.06);
        break;
      case 'gate':
        this.tone(90, 45, 0.7, 'sawtooth', 0.22);
        this.noise(0.6, 0.2, 300, 'lowpass');
        break;
      case 'boss-charge':
        this.tone(110, 55, 0.45, 'sawtooth', 0.14);
        break;
      case 'boss-hit':
        this.tone(160, 70, 0.1, 'square', 0.14);
        this.noise(0.07, 0.15, 1100, 'bandpass');
        break;
      case 'boss-defeat':
        [110, 165, 220, 277, 330, 440].forEach((frequency, index) => {
          this.tone(
            frequency,
            frequency * 1.01,
            2.6,
            'sine',
            0.11,
            index * 0.12,
          );
        });
        this.noise(1.2, 0.25, 500, 'lowpass');
        break;
      case 'nova':
        this.tone(120, 900, 0.55, 'sawtooth', 0.14);
        this.noise(0.5, 0.25, 900, 'bandpass');
        break;
      case 'death':
        this.tone(240, 50, 0.7, 'sawtooth', 0.22);
        break;
      case 'win':
        [392, 494, 587, 784, 988, 1175].forEach((frequency, index) => {
          this.tone(frequency, frequency, 0.5, 'triangle', 0.12, index * 0.13);
        });
        break;
      case 'click':
        this.tone(640, 480, 0.06, 'triangle', 0.1);
        break;
    }
  }

  stopMusic(fade = 0.6) {
    this.musicToken += 1;
    this.currentMusic = '';
    const context = this.context;
    const gain = this.musicGain;
    if (context && gain) {
      // Cada faixa usa um no de ganho proprio; o antigo some suavemente.
      gain.gain.setTargetAtTime(0, context.currentTime, fade / 3);
      const next = context.createGain();
      next.gain.value = 0.5;
      next.connect(this.master!);
      this.musicGain = next;
    }
  }

  playMusic(mode: MusicMode, root: number) {
    const id = `${mode}:${String(root)}`;
    if (!this.context || this.currentMusic === id) return;
    this.stopMusic();
    this.currentMusic = id;
    const token = this.musicToken;
    const bus = this.musicGain!;
    const boss = mode === 'boss';

    this.pad(root, boss ? 1.05946 : 1.5, bus, token);

    const beat = boss ? 0.3 : 0.62;
    let step = 0;
    const tick = () => {
      if (token !== this.musicToken || !this.context) return;
      if (boss) {
        const line = [1, 1, 1.2, 1, 1.5, 1, 1.2, 0.89];
        const note = (root / 2) * line[step % line.length];
        this.tone(note, note * 0.98, beat * 0.9, 'sawtooth', 0.09, 0, bus);
        if (step % 2 === 0) this.tone(140, 45, 0.22, 'sine', 0.3, 0, bus);
        if (step % 4 === 2) this.noise(0.1, 0.09, 6000, 'highpass');
        if (step % 8 === 6) {
          this.tone(root * 4, root * 4.2, 0.18, 'square', 0.05, 0, bus);
        }
      } else {
        if (step % 4 === 0) {
          this.tone(root / 2, root / 2, beat * 3.5, 'triangle', 0.13, 0, bus);
        }
        if (mode === 'explore' || step % 2 === 0) {
          const note =
            root *
            2 *
            PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
          if (Math.random() < 0.7) {
            this.tone(note, note, 1.4, 'sine', 0.06, Math.random() * 0.15, bus);
          }
        }
      }
      step += 1;
      window.setTimeout(tick, beat * 1000);
    };
    tick();
  }

  private pad(root: number, ratio: number, bus: GainNode, token: number) {
    const context = this.context;
    if (!context) return;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.09, context.currentTime, 1.2);
    filter.connect(gain).connect(bus);

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    const oscillators = [root, root * ratio, root * 2.005, root * 0.995].map(
      (frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 0 ? 'sawtooth' : 'triangle';
        oscillator.frequency.value = frequency;
        oscillator.connect(filter);
        oscillator.start();
        return oscillator;
      },
    );

    const watcher = window.setInterval(() => {
      if (token !== this.musicToken) {
        window.clearInterval(watcher);
        window.setTimeout(() => {
          for (const oscillator of [...oscillators, lfo]) {
            try {
              oscillator.stop();
            } catch {
              // Ja parado.
            }
          }
          gain.disconnect();
        }, 2500);
      }
    }, 300);
  }
}

export const audio = new AudioBus();
