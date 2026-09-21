import type Phaser from 'phaser';

import { RENDER_SCALE } from '../constants';

/**
 * O canvas e maior que o mundo logico para preservar detalhes em Full HD e 4K.
 * O zoom devolve as cenas ao sistema de coordenadas original (1200 x 600).
 */
export function configureHighResolutionCamera(scene: Phaser.Scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RENDER_SCALE).setScroll(0, 0);
}
