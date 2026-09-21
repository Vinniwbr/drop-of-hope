import { Game, Scale } from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from './constants';
import * as scenes from './scenes';

/**
 * https://docs.phaser.io/api-documentation/api-documentation
 */
const game = new Game({
  antialias: true,
  antialiasGL: true,
  backgroundColor: '#0b0c10',
  disableContextMenu: true,
  height: GAME_HEIGHT * RENDER_SCALE,
  input: { activePointers: 4 },
  physics: {
    arcade: {
      debug: false,
      gravity: { x: 0, y: 1450 },
    },
    default: 'arcade',
  },
  // A arte e pintada a mao: suavizar (nao "pixel art") evita bordas serrilhadas.
  pixelArt: false,
  powerPreference: 'high-performance',
  roundPixels: false,
  // Suaviza sprites e cenarios rasterizados quando a TV amplia o canvas.
  smoothPixelArt: true,
  scale: {
    autoCenter: Scale.CENTER_BOTH,
    autoRound: true,
    mode: Scale.FIT,
  },
  scene: [
    scenes.Boot,
    ...Object.values(scenes).filter((scene) => scene !== scenes.Boot),
  ],
  title: 'Drop of Hope',
  url: import.meta.env.VITE_APP_HOMEPAGE,
  version: import.meta.env.VITE_APP_VERSION,
  width: GAME_WIDTH * RENDER_SCALE,
});

if (import.meta.env.DEV) {
  void import('./dev-tools').then((tools) => {
    tools.installDevTools(game);
  });
}
