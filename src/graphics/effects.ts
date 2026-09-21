import Phaser from 'phaser';

import { RENDER_SCALE } from '../constants';
import { TEX } from './textures';

type Flashable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Tint & {
    active: boolean;
  };

/** Efeitos visuais reutilizaveis: particulas, aneis, flashes e textos flutuantes. */
export class Effects {
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private inkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkEmitters = new Map<
    number,
    Phaser.GameObjects.Particles.ParticleEmitter
  >();

  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.dustEmitter = scene.add
      .particles(0, 0, TEX.SPARK, {
        alpha: { end: 0, start: 0.55 },
        emitting: false,
        gravityY: -30,
        lifespan: { max: 480, min: 260 },
        scale: { end: 0, start: 0.7 },
        speed: { max: 70, min: 15 },
        tint: 0xb9bbc4,
      })
      .setDepth(24);
    this.inkEmitter = scene.add
      .particles(0, 0, TEX.SPLASH, {
        alpha: { end: 0.2, start: 1 },
        emitting: false,
        gravityY: 900,
        lifespan: { max: 720, min: 380 },
        rotate: { max: 360, min: 0 },
        scale: { end: 0.1, start: 0.5 },
        speed: { max: 330, min: 90 },
        tint: 0x0b0b10,
      })
      .setDepth(26);
  }

  dust(x: number, y: number, count = 6) {
    this.dustEmitter.explode(count, x, y);
  }

  /** Respingo de tinta escura (impactos, mortes). */
  ink(x: number, y: number, count = 10) {
    this.inkEmitter.explode(count, x, y);
  }

  /** Faiscas brilhantes na cor da fase (coletas, restauracao). */
  spark(x: number, y: number, color: number, count = 12, speed = 200) {
    let emitter = this.sparkEmitters.get(color);
    if (!emitter) {
      emitter = this.scene.add
        .particles(0, 0, TEX.SPARK, {
          alpha: { end: 0, start: 1 },
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
          lifespan: { max: 700, min: 350 },
          scale: { end: 0, start: 1 },
          speed: { max: speed, min: speed * 0.3 },
          tint: color,
        })
        .setDepth(40);
      this.sparkEmitters.set(color, emitter);
    }
    emitter.explode(count, x, y);
  }

  /** Anel que se expande (impactos fortes, ondas de choque). */
  ring(
    x: number,
    y: number,
    color: number,
    toScale = 3,
    duration = 520,
    depth = 39,
  ) {
    const ring = this.scene.add
      .image(x, y, TEX.RING)
      .setTint(color)
      .setDepth(depth)
      .setScale(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => {
        ring.destroy();
      },
      scale: toScale,
      targets: ring,
    });
  }

  /** Brilho suave que pulsa e some (marcadores, chefes). */
  glow(x: number, y: number, color: number, size = 1, duration = 500) {
    const glow = this.scene.add
      .image(x, y, TEX.GLOW)
      .setTint(color)
      .setDepth(38)
      .setScale(size * 0.5)
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      alpha: 0,
      duration,
      onComplete: () => {
        glow.destroy();
      },
      scale: size * 1.4,
      targets: glow,
    });
  }

  /** Pisca o objeto de branco (funciona mesmo em sprites pretos). */
  flash(target: Flashable, duration = 90, color = 0xffffff) {
    target.setTint(color).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(duration, () => {
      if (target.active) {
        target.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    });
  }

  /** Texto de dano/aviso que sobe e desaparece. */
  text(x: number, y: number, message: string, color = '#ffffff', size = 15) {
    const label = this.scene.add
      .text(x, y, message, {
        color,
        fontFamily: 'Georgia, serif',
        fontSize: `${String(size)}px`,
        fontStyle: 'bold',
        resolution: RENDER_SCALE,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(116);
    this.scene.tweens.add({
      alpha: 0,
      duration: 700,
      ease: 'Quad.Out',
      onComplete: () => {
        label.destroy();
      },
      targets: label,
      y: y - 38,
    });
  }
}
