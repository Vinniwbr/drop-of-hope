import Phaser from 'phaser';

const INK = 0x08090c;
const INK_LIGHT = 0x14161d;

function seeded(seed: number) {
  let state = (seed * 7919 + 104729) % 233280;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export interface SurfaceOptions {
  accent: number;
  /** Profundidade do bloco, para baixo a partir do topo. */
  depth: number;
  /** Gotas penduradas por baixo (plataformas flutuantes). */
  hanging?: boolean;
  seed: number;
  top: number;
  width: number;
  x: number;
}

/**
 * Desenha uma superficie de "tinta": topo irregular, linha luminosa na cor da
 * fase, capim escuro e gotas escorrendo. Tudo em um unico Graphics estatico.
 */
export function drawInkSurface(
  scene: Phaser.Scene,
  options: SurfaceOptions,
): Phaser.GameObjects.Graphics {
  const { x, top, width, depth, accent, hanging = false } = options;
  const random = seeded(options.seed);
  const graphics = scene.add.graphics().setDepth(8);

  const edge: Phaser.Math.Vector2[] = [];
  for (let offset = 0; offset <= width; offset += 14) {
    const wobble = (random() - 0.5) * 4.5;
    edge.push(
      new Phaser.Math.Vector2(x + Math.min(offset, width), top + wobble),
    );
  }

  const bottom = top + depth;
  const body = [
    ...edge,
    new Phaser.Math.Vector2(x + width, bottom),
    new Phaser.Math.Vector2(x, bottom),
  ];
  graphics.fillStyle(INK, 1);
  graphics.fillPoints(body, true);

  // Faixa mais clara logo abaixo do topo, para dar volume.
  graphics.fillStyle(INK_LIGHT, 1);
  graphics.fillPoints(
    [
      ...edge,
      ...[...edge]
        .reverse()
        .map((point) => new Phaser.Math.Vector2(point.x, point.y + 7)),
    ],
    true,
  );

  graphics.lineStyle(6, accent, 0.14);
  graphics.strokePoints(edge, false);
  graphics.lineStyle(2, accent, 0.65);
  graphics.strokePoints(edge, false);

  // Capim escuro.
  graphics.fillStyle(0x050609, 1);
  for (let offset = 8; offset < width - 8; offset += 18 + random() * 22) {
    const height = 5 + random() * 12;
    const baseX = x + offset;
    graphics.fillTriangle(
      baseX,
      top + 1,
      baseX + 3,
      top - height,
      baseX + 6,
      top + 1,
    );
    if (random() > 0.5) {
      graphics.fillTriangle(
        baseX + 4,
        top + 1,
        baseX + 9,
        top - height * 0.7,
        baseX + 11,
        top + 1,
      );
    }
  }

  // Gotas de tinta escorrendo pela parte de baixo.
  if (hanging) {
    graphics.fillStyle(INK, 1);
    for (let offset = 10; offset < width - 6; offset += 16 + random() * 24) {
      const length = 8 + random() * 20;
      graphics.fillTriangle(
        x + offset,
        bottom - 1,
        x + offset + 7,
        bottom - 1,
        x + offset + 3.5,
        bottom + length,
      );
    }
  }

  // Brilho pontual na cor da fase (como tinta ainda molhada).
  graphics.fillStyle(accent, 0.28);
  for (let index = 0; index < Math.max(1, Math.floor(width / 140)); index++) {
    graphics.fillCircle(
      x + 20 + random() * (width - 40),
      top + 9 + random() * Math.min(18, depth - 12),
      1.5 + random() * 1.5,
    );
  }
  return graphics;
}

/** Plataforma que racha: mais clara, com fissuras luminosas. */
export function drawCrumblePlatform(
  scene: Phaser.Scene,
  width: number,
  accent: number,
  seed: number,
): Phaser.GameObjects.Graphics {
  const random = seeded(seed);
  const graphics = scene.add.graphics().setDepth(9);
  const height = 24;
  graphics.fillStyle(0x1b1d26, 1);
  graphics.fillRoundedRect(-width / 2, 0, width, height, 5);
  graphics.lineStyle(2, accent, 0.7);
  graphics.strokeRoundedRect(-width / 2, 0, width, height, 5);
  graphics.lineStyle(2, 0x000000, 0.7);
  for (let index = 0; index < Math.max(2, Math.floor(width / 26)); index++) {
    const cx = -width / 2 + 10 + random() * (width - 20);
    graphics.beginPath();
    graphics.moveTo(cx, 2);
    graphics.lineTo(cx + (random() - 0.5) * 14, height * 0.5);
    graphics.lineTo(cx + (random() - 0.5) * 16, height - 2);
    graphics.strokePath();
  }
  graphics.fillStyle(accent, 0.3);
  graphics.fillRect(-width / 2 + 4, 1, width - 8, 2);
  return graphics;
}

/** Plataforma movel: pedra escura com nucleo luminoso. */
export function drawMoverPlatform(
  scene: Phaser.Scene,
  width: number,
  accent: number,
): Phaser.GameObjects.Container {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x15171c, 1);
  graphics.fillRoundedRect(-width / 2, 0, width, 22, 8);
  graphics.lineStyle(2, accent, 0.9);
  graphics.strokeRoundedRect(-width / 2, 0, width, 22, 8);
  graphics.fillStyle(accent, 0.85);
  graphics.fillCircle(0, 11, 5);
  graphics.fillStyle(0x000000, 1);
  for (const dx of [-width / 4, width / 4]) {
    graphics.fillTriangle(dx - 4, 22, dx + 4, 22, dx, 32);
  }
  return scene.add.container(0, 0, [graphics]).setDepth(13);
}

/** Abismo entre trechos de chao: sombra que engole a luz. */
export function drawPit(
  scene: Phaser.Scene,
  start: number,
  end: number,
  top: number,
  accent: number,
) {
  const graphics = scene.add.graphics().setDepth(6);
  const width = end - start;
  for (let index = 0; index < 6; index++) {
    graphics.fillStyle(0x000000, 0.14 + index * 0.13);
    graphics.fillRect(start, top + index * 18, width, 18);
  }
  graphics.fillStyle(0x000000, 0.92);
  graphics.fillRect(start, top + 108, width, 200);
  graphics.lineStyle(2, accent, 0.18);
  graphics.lineBetween(start, top, start, top + 90);
  graphics.lineBetween(end, top, end, top + 90);
  return graphics;
}

/** Lanterna de checkpoint: apagada ate o jogador passar. */
export function drawLantern(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  accent: number,
) {
  const graphics = scene.add.graphics().setDepth(10);
  graphics.fillStyle(0x050609, 1);
  graphics.fillRect(x - 3, groundY - 74, 6, 74);
  graphics.fillTriangle(
    x - 16,
    groundY - 70,
    x + 16,
    groundY - 70,
    x,
    groundY - 90,
  );
  graphics.lineStyle(3, 0x2b2c36, 1);
  graphics.strokeRoundedRect(x - 12, groundY - 70, 24, 30, 6);
  graphics.fillStyle(0x0b0b10, 1);
  graphics.fillRoundedRect(x - 12, groundY - 70, 24, 30, 6);
  const flame = scene.add
    .circle(x, groundY - 55, 7, accent, 1)
    .setDepth(11)
    .setAlpha(0);
  const glow = scene.add
    .image(x, groundY - 55, 'TEX_GLOW')
    .setTint(accent)
    .setDepth(11)
    .setScale(1.6)
    .setAlpha(0)
    .setBlendMode(Phaser.BlendModes.ADD);
  return { flame, glow, graphics };
}
