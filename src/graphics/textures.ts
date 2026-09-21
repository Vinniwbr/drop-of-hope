import Phaser from 'phaser';

import { PHASES } from '../data/phases';

/** Chaves das texturas geradas por codigo (nao ha arquivos para elas). */
export const TEX = {
  DROP: 'TEX_DROP',
  GLOW: 'TEX_GLOW',
  HEART_EMPTY: 'TEX_HEART_EMPTY',
  HEART_FULL: 'TEX_HEART_FULL',
  PIXEL: 'TEX_PIXEL',
  RING: 'TEX_RING',
  SHARD: 'TEX_SHARD',
  SPARK: 'TEX_SPARK',
  SPIKE: 'TEX_SPIKE',
  SPLASH: 'TEX_SPLASH',
  VIGNETTE: 'TEX_VIGNETTE',
} as const;

export const ENEMY_TEX = {
  BRUTE: ['TEX_BRUTE_0', 'TEX_BRUTE_1'],
  CRAWLER: ['TEX_CRAWLER_0', 'TEX_CRAWLER_1'],
  FLYER: ['TEX_FLYER_0', 'TEX_FLYER_1'],
  HOPPER: ['TEX_HOPPER_0', 'TEX_HOPPER_1'],
  SPITTER: ['TEX_SPITTER_0', 'TEX_SPITTER_1'],
} as const;

export function orbTexture(phaseId: number) {
  return `TEX_ORB_${String(phaseId)}`;
}

const INK = 0x0b0b10;
const INK_EDGE = 0x2b2c36;

/** Pseudo-aleatorio deterministico para o contorno "borrado" de tinta. */
function seeded(seed: number) {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function blobPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  roughness = 0.12,
) {
  const random = seeded(seed);
  const points: Phaser.Math.Vector2[] = [];
  const steps = 22;
  for (let index = 0; index < steps; index++) {
    const angle = (index / steps) * Math.PI * 2;
    const wobble = 1 + (random() - 0.5) * roughness * 2;
    points.push(
      new Phaser.Math.Vector2(
        cx + Math.cos(angle) * rx * wobble,
        cy + Math.sin(angle) * ry * wobble,
      ),
    );
  }
  return points;
}

function fillBlob(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  color = INK,
) {
  graphics.fillStyle(color, 1);
  graphics.fillPoints(blobPoints(cx, cy, rx, ry, seed), true);
}

function eyes(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  gap: number,
  size: number,
) {
  graphics.fillStyle(0xffffff, 1);
  graphics.fillEllipse(x - gap, y, size * 1.5, size * 0.75);
  graphics.fillEllipse(x + gap, y, size * 1.5, size * 0.75);
}

export function createTextures(scene: Phaser.Scene) {
  const make = (
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ) => {
    if (scene.textures.exists(key)) {
      return;
    }
    const graphics = scene.make.graphics({}, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  };

  make(TEX.PIXEL, 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
  });

  make(TEX.SPARK, 16, 16, (g) => {
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 2.6);
  });

  if (!scene.textures.exists(TEX.GLOW)) {
    const canvas = scene.textures.createCanvas(TEX.GLOW, 128, 128)!;
    const context = canvas.getContext();
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    canvas.refresh();
  }

  if (!scene.textures.exists(TEX.VIGNETTE)) {
    const canvas = scene.textures.createCanvas(TEX.VIGNETTE, 600, 300)!;
    const context = canvas.getContext();
    const gradient = context.createRadialGradient(300, 150, 110, 300, 150, 360);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.65, 'rgba(0,0,0,0.28)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.78)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 600, 300);
    canvas.refresh();
  }

  make(TEX.RING, 96, 96, (g) => {
    g.lineStyle(5, 0xffffff, 1);
    g.strokeCircle(48, 48, 42);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(48, 48, 36);
  });

  make(TEX.SPLASH, 48, 48, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillPoints(blobPoints(24, 24, 14, 12, 7, 0.4), true);
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      g.fillCircle(24 + Math.cos(angle) * 19, 24 + Math.sin(angle) * 17, 3);
    }
  });

  // Gota de tinta coletavel (branca; recebe a cor da fase por tint).
  make(TEX.DROP, 28, 36, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(14, 1, 3, 20, 25, 20);
    g.fillCircle(14, 23, 11);
    g.fillStyle(0x000000, 0.22);
    g.fillCircle(17, 27, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(9, 20, 3);
  });

  // Cristal de cor: exigido para abrir o portao do chefe.
  make(TEX.SHARD, 52, 52, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(26, 2),
        new Phaser.Math.Vector2(46, 26),
        new Phaser.Math.Vector2(26, 50),
        new Phaser.Math.Vector2(6, 26),
      ],
      true,
    );
    g.fillStyle(0x000000, 0.25);
    g.fillTriangle(26, 2, 46, 26, 26, 26);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(26, 26, 24);
  });

  make(TEX.HEART_FULL, 28, 34, (g) => {
    g.fillStyle(0x0b0b10, 1);
    g.fillTriangle(14, 1, 2, 21, 26, 21);
    g.fillCircle(14, 23, 12);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(14, 23, 11.5);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(14, 6, 6, 20, 22, 20);
    g.fillCircle(14, 23, 9);
  });

  make(TEX.HEART_EMPTY, 28, 34, (g) => {
    g.lineStyle(3, 0x5c5f69, 1);
    g.strokeTriangle(14, 3, 3, 21, 25, 21);
    g.strokeCircle(14, 23, 11);
    g.fillStyle(0x0b0b10, 0.7);
    g.fillCircle(14, 23, 9);
  });

  make(TEX.SPIKE, 32, 44, (g) => {
    g.fillStyle(INK, 1);
    g.fillTriangle(16, 0, 1, 44, 31, 44);
    g.lineStyle(2, INK_EDGE, 1);
    g.strokeTriangle(16, 1, 2, 43, 30, 43);
  });

  for (const phase of Object.values(PHASES)) {
    make(orbTexture(phase.id), 44, 44, (g) => {
      g.fillStyle(phase.accent, 0.28);
      g.fillCircle(22, 22, 21);
      g.fillStyle(INK, 1);
      g.fillCircle(22, 22, 15);
      g.lineStyle(3, phase.accent, 1);
      g.strokeCircle(22, 22, 15);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(17, 17, 3);
    });
  }

  // Inimigos: silhuetas de tinta com olhos brancos, no estilo do heroi.
  // Cada tipo tem 2 quadros (usados nas animacoes andar/bater asas/abrir).
  [0, 1].forEach((frame) => {
    const squash = frame === 0 ? 1 : 0.86;
    const stretch = frame === 0 ? 1 : 1.12;

    make(ENEMY_TEX.CRAWLER[frame], 72, 56, (g) => {
      fillBlob(
        g,
        36,
        34 + (1 - squash) * 12,
        27 * stretch,
        19 * squash,
        3 + frame,
      );
      const legShift = frame === 0 ? 8 : 2;
      g.fillStyle(INK, 1);
      g.fillRoundedRect(20 - legShift / 2, 44, 9, 11, 3);
      g.fillRoundedRect(44 + legShift / 2, 44, 9, 11, 3);
      fillBlob(g, 26, 20, 5, 6, 12, INK);
      fillBlob(g, 46, 20, 5, 6, 13, INK);
      eyes(g, 36, 32, 8, 6);
    });

    make(ENEMY_TEX.HOPPER[frame], 64, 72, (g) => {
      const tall = frame === 0 ? 0.8 : 1.15;
      fillBlob(g, 32, 40, 21 * (2 - tall) * 0.62, 24 * tall, 5 + frame);
      g.fillStyle(INK, 1);
      const leg = frame === 0 ? 10 : 18;
      g.fillRoundedRect(10, 60 - leg / 4, 14, 12, 4);
      g.fillRoundedRect(40, 60 - leg / 4, 14, 12, 4);
      eyes(g, 32, 34, 7, 6);
    });

    make(ENEMY_TEX.FLYER[frame], 88, 64, (g) => {
      const wing = frame === 0 ? -16 : 10;
      g.fillStyle(INK, 1);
      g.fillTriangle(44, 32, 6, 32 + wing, 26, 46);
      g.fillTriangle(44, 32, 82, 32 + wing, 62, 46);
      g.lineStyle(2, INK_EDGE, 1);
      g.lineBetween(44, 32, 8, 32 + wing);
      g.lineBetween(44, 32, 80, 32 + wing);
      fillBlob(g, 44, 34, 15, 16, 9 + frame);
      eyes(g, 44, 31, 6, 5);
    });

    make(ENEMY_TEX.SPITTER[frame], 64, 88, (g) => {
      g.fillStyle(INK, 1);
      g.fillRoundedRect(27, 44, 10, 44, 4);
      g.fillTriangle(27, 88, 12, 88, 27, 74);
      g.fillTriangle(37, 88, 52, 88, 37, 74);
      fillBlob(g, 32, 30, 24, 22 - frame * 2, 14 + frame);
      const open = frame === 1;
      g.fillStyle(0x000000, 1);
      g.fillEllipse(32, open ? 40 : 38, 22, open ? 13 : 5);
      g.lineStyle(2, INK_EDGE, 1);
      g.strokeEllipse(32, open ? 40 : 38, 22, open ? 13 : 5);
      eyes(g, 32, 22, 9, 6);
    });

    make(ENEMY_TEX.BRUTE[frame], 112, 96, (g) => {
      const lean = frame === 0 ? 0 : 4;
      fillBlob(g, 56, 56, 40, 32 - lean, 20 + frame);
      g.fillStyle(INK, 1);
      g.fillTriangle(24, 30, 18, 4, 40, 24);
      g.fillTriangle(88, 30, 94, 4, 72, 24);
      g.fillRoundedRect(26 + lean, 78, 18, 18, 5);
      g.fillRoundedRect(68 - lean, 78, 18, 18, 5);
      eyes(g, 56, 46, 14, 9);
    });
  });
}
