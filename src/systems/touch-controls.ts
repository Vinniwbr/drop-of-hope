import Phaser from 'phaser';

import { RENDER_SCALE } from '../constants';
import { type Action, touchHeld } from './input';

interface ButtonSpec {
  action: Action;
  color: number;
  label: string;
  radius: number;
  x: number;
  y: number;
}

/** Layout pensado para celular na horizontal: polegar esquerdo anda, direito age. */
const BUTTONS: ButtonSpec[] = [
  { action: 'left', color: 0xffffff, label: '<', radius: 50, x: 92, y: 508 },
  { action: 'right', color: 0xffffff, label: '>', radius: 50, x: 226, y: 508 },
  { action: 'crouch', color: 0xffffff, label: 'v', radius: 38, x: 159, y: 420 },
  {
    action: 'jump',
    color: 0x47c7ad,
    label: 'PULO',
    radius: 58,
    x: 1100,
    y: 500,
  },
  {
    action: 'attack',
    color: 0xe15b72,
    label: 'PINCEL',
    radius: 46,
    x: 978,
    y: 528,
  },
  {
    action: 'shoot',
    color: 0x62cbea,
    label: 'TINTA',
    radius: 42,
    x: 1010,
    y: 415,
  },
  {
    action: 'dash',
    color: 0xf2b84b,
    label: 'DASH',
    radius: 38,
    x: 1128,
    y: 388,
  },
  {
    action: 'nova',
    color: 0xc38bff,
    label: 'NOVA',
    radius: 36,
    x: 892,
    y: 452,
  },
];

let touchSeen = false;

/** Verdadeiro em aparelhos com tela sensivel ao toque. */
export function isTouchDevice(): boolean {
  return (
    touchSeen ||
    'ontouchstart' in window ||
    (typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 0)
  );
}

export class TouchControls {
  private container: Phaser.GameObjects.Container;
  private novaGlow?: Phaser.GameObjects.Arc;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, onPause: () => void) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(300);
    for (const spec of BUTTONS) {
      this.createButton(spec);
    }

    const pause = scene.add
      .text(600, 30, 'II', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        resolution: RENDER_SCALE,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0.7);
    const pauseZone = scene.add
      .zone(600, 30, 64, 64)
      .setScrollFactor(0)
      .setInteractive();
    pauseZone.on('pointerdown', onPause);
    this.container.add([pause, pauseZone]);

    const visible = isTouchDevice();
    this.container.setVisible(visible);
    scene.input.once('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        touchSeen = true;
        this.container.setVisible(true);
      }
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of Object.keys(touchHeld) as Action[]) {
        touchHeld[key] = false;
      }
    });
  }

  /** Brilho no botao NOVA quando a barra de tinta esta cheia. */
  setNovaReady(ready: boolean) {
    this.novaGlow?.setAlpha(ready ? 0.9 : 0.15);
  }

  private createButton(spec: ButtonSpec) {
    const base = this.scene.add
      .circle(spec.x, spec.y, spec.radius, 0x0a0b0f, 0.42)
      .setStrokeStyle(3, spec.color, 0.85);
    const text = this.scene.add
      .text(spec.x, spec.y, spec.label, {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: spec.radius > 44 ? '15px' : '12px',
        fontStyle: 'bold',
        resolution: RENDER_SCALE,
      })
      .setOrigin(0.5)
      .setAlpha(0.9);
    const zone = this.scene.add
      .zone(spec.x, spec.y, spec.radius * 2.4, spec.radius * 2.4)
      .setInteractive();
    this.container.add([base, text, zone]);
    if (spec.action === 'nova') {
      this.novaGlow = base;
      base.setAlpha(0.15);
    }

    const press = () => {
      touchHeld[spec.action] = true;
      base.setFillStyle(spec.color, 0.5);
    };
    const release = () => {
      touchHeld[spec.action] = false;
      base.setFillStyle(0x0a0b0f, 0.42);
    };
    zone.on('pointerdown', press);
    zone.on('pointerup', release);
    zone.on('pointerout', release);
    zone.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      // Deslizar o dedo entre "<" e ">" continua andando.
      if (
        pointer.isDown &&
        (spec.action === 'left' || spec.action === 'right')
      ) {
        press();
      }
    });
  }
}
