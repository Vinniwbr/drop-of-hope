import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import type { WeatherInfo } from '../services';
import { audio } from '../systems/audio';
import { TEX } from './textures';

/**
 * Traduz o clima REAL (Open-Meteo) em efeitos dentro da fase:
 * chuva, neve, neblina, tempestade com relampagos e escurecimento noturno.
 */
export class WeatherFx {
  private scene: Phaser.Scene;
  private lightning?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, weather: WeatherInfo, accent: number) {
    this.scene = scene;
    if (!weather.live) {
      return;
    }
    switch (weather.kind) {
      case 'rain':
        this.rain(false);
        break;
      case 'storm':
        this.rain(true);
        this.startLightning();
        break;
      case 'snow':
        this.snow();
        break;
      case 'fog':
        this.fog();
        break;
      case 'cloudy':
        this.fog(0.06);
        break;
      case 'clear':
        break;
    }
    if (!weather.isDay) {
      this.night(accent);
    }
  }

  destroy() {
    this.lightning?.remove();
  }

  private rain(heavy: boolean) {
    this.scene.add
      .particles(0, 0, TEX.PIXEL, {
        alpha: { end: 0.05, start: 0.45 },
        angle: { max: 104, min: 96 },
        frequency: heavy ? 6 : 14,
        lifespan: 800,
        scaleX: 0.5,
        scaleY: { max: 7, min: 4 },
        speed: { max: heavy ? 1150 : 900, min: heavy ? 950 : 750 },
        tint: 0xa9bad6,
        x: { max: GAME_WIDTH + 200, min: -100 },
        y: -20,
      })
      .setScrollFactor(0)
      .setDepth(58);
    this.scene.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x1a2436,
        heavy ? 0.28 : 0.16,
      )
      .setScrollFactor(0)
      .setDepth(57);
  }

  private snow() {
    this.scene.add
      .particles(0, 0, TEX.SPARK, {
        alpha: { end: 0.1, start: 0.9 },
        angle: { max: 110, min: 70 },
        frequency: 30,
        lifespan: 5200,
        scale: { max: 0.7, min: 0.25 },
        speed: { max: 110, min: 40 },
        tint: 0xffffff,
        x: { max: GAME_WIDTH + 100, min: -100 },
        y: -20,
      })
      .setScrollFactor(0)
      .setDepth(58);
  }

  private fog(strength = 0.16) {
    for (let index = 0; index < 4; index++) {
      const fog = this.scene.add
        .image(200 + index * 340, 430 + (index % 2) * 60, TEX.GLOW)
        .setScrollFactor(0.15 + index * 0.05)
        .setScale(7, 2.6)
        .setAlpha(strength)
        .setTint(0xcfd6e4)
        .setDepth(4);
      this.scene.tweens.add({
        duration: 9000 + index * 1700,
        ease: 'Sine.InOut',
        repeat: -1,
        targets: fog,
        x: fog.x + 160,
        yoyo: true,
      });
    }
  }

  private night(accent: number) {
    this.scene.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x050a1c,
        0.34,
      )
      .setScrollFactor(0)
      .setDepth(56)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    // Vaga-lumes na cor da fase.
    this.scene.add
      .particles(0, 0, TEX.SPARK, {
        alpha: { end: 0, start: 0.85 },
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
        lifespan: 3600,
        scale: { end: 0.1, start: 0.6 },
        speed: { max: 24, min: 6 },
        tint: accent,
        x: { max: GAME_WIDTH, min: 0 },
        y: { max: 470, min: 120 },
      })
      .setScrollFactor(0)
      .setDepth(55);
  }

  private startLightning() {
    const flash = this.scene.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0xffffff,
        0,
      )
      .setScrollFactor(0)
      .setDepth(59);
    const strike = () => {
      this.scene.tweens.add({
        alpha: { from: 0.55, to: 0 },
        duration: 260,
        repeat: 1,
        targets: flash,
        yoyo: false,
      });
      this.scene.time.delayedCall(600, () => {
        audio.sfx('land');
      });
    };
    const schedule = (min: number, max: number) => {
      this.lightning = this.scene.time.addEvent({
        callback: () => {
          strike();
          schedule(7000, 14000);
        },
        delay: Phaser.Math.Between(min, max),
      });
    };
    schedule(3000, 6000);
  }
}
