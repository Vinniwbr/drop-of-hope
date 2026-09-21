import Phaser from 'phaser';

import { RENDER_SCALE } from '../constants';
import { audio } from '../systems/audio';

export function textStyle(
  size: number,
  color = '#ffffff',
  family = 'Georgia, serif',
  stroke = true,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    color,
    fontFamily: family,
    fontSize: `${String(size)}px`,
    resolution: RENDER_SCALE,
    ...(stroke
      ? {
          stroke: '#000000',
          strokeThickness: Math.max(3, Math.round(size / 4)),
        }
      : {}),
  };
}

export interface ButtonOptions {
  accent?: number;
  depth?: number;
  fixed?: boolean;
  height?: number;
  width?: number;
}

/** Botao clicavel (mouse e toque) com destaque ao passar o dedo/mouse. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const { accent = 0xffffff, depth = 200, fixed = true } = options;
  const width = options.width ?? 280;
  const height = options.height ?? 46;
  const background = scene.add
    .rectangle(0, 0, width, height, 0x101218, 0.94)
    .setStrokeStyle(2, accent, 0.85);
  const text = scene.add
    .text(0, 0, label, textStyle(17, '#ffffff', 'Georgia, serif', false))
    .setOrigin(0.5);
  const container = scene.add
    .container(x, y, [background, text])
    .setSize(width, height)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  if (fixed) {
    container.setScrollFactor(0);
    background.setScrollFactor(0);
    text.setScrollFactor(0);
  }
  container.on('pointerover', () => {
    background.setFillStyle(accent, 0.22);
    container.setScale(1.03);
  });
  container.on('pointerout', () => {
    background.setFillStyle(0x101218, 0.94);
    container.setScale(1);
  });
  container.on('pointerdown', () => {
    audio.unlock();
    audio.sfx('click');
    onClick();
  });
  return container;
}
