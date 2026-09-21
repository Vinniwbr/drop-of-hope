import { ARENA_WIDTH, KEY } from '../constants';

export type EnemyType = 'brute' | 'crawler' | 'flyer' | 'hopper' | 'spitter';
export type BossId = 'heart' | 'mirror' | 'shadow' | 'skull' | 'thorn';

export interface PlatformSpec {
  kind?: 'crumble' | 'solid';
  w: number;
  x: number;
  y: number;
}

export interface MoverSpec {
  axis: 'x' | 'y';
  duration: number;
  range: number;
  w: number;
  x: number;
  y: number;
}

export interface EnemySpec {
  range?: number;
  type: EnemyType;
  x: number;
  y?: number;
}

/** Fileira de gotas de tinta: linha reta ou arco sobre um vao. */
export interface DropSpec {
  arc?: number;
  count: number;
  dx: number;
  x: number;
  y: number;
}

export interface TimedHazardSpec {
  offset: number;
  period: number;
  w?: number;
  x: number;
}

/** Dica de ensino exibida no cenario quando o jogador chega perto. */
export interface HintSpec {
  keys: string;
  touch: string;
  x: number;
}

export interface PhaseConfig {
  accent: number;
  bossHealth: number;
  bossId: BossId;
  bossName: string;
  bossTexture: string;
  bossTint: number;
  checkpoints: number[];
  colorName: string;
  drips: TimedHazardSpec[];
  drops: DropSpec[];
  enemies: EnemySpec[];
  /** Trechos de chao (inicio, fim). O ultimo trecho se estende ate a arena. */
  ground: [number, number][];
  hints?: HintSpec[];
  ice: boolean;
  id: number;
  intro: string;
  length: number;
  movers: MoverSpec[];
  musicRoot: number;
  name: string;
  platforms: PlatformSpec[];
  shards: { x: number; y: number }[];
  spikes: { w: number; x: number }[];
  thorns: TimedHazardSpec[];
}

/** Posicao X do portao que abre o caminho para a arena do chefe. */
export function arenaGateX(config: PhaseConfig) {
  return config.length;
}

export function worldWidthOf(config: PhaseConfig) {
  return config.length + ARENA_WIDTH;
}

const END = Number.POSITIVE_INFINITY;

export const PHASES: Record<number, PhaseConfig> = {
  1: {
    accent: 0x47c7ad,
    bossHealth: 36,
    bossId: 'shadow',
    bossName: 'SOMBRA ERRANTE',
    bossTexture: KEY.SPRITESHEET.BOSS_SHADOW,
    bossTint: 0xffffff,
    checkpoints: [1400, 2880],
    colorName: 'Verde-água',
    drips: [
      { offset: 200, period: 3100, x: 1450 },
      { offset: 1200, period: 3300, x: 2660 },
    ],
    drops: [
      { count: 6, dx: 45, x: 200, y: 490 },
      { arc: 70, count: 5, dx: 45, x: 690, y: 440 },
      { count: 4, dx: 40, x: 1000, y: 490 },
      { arc: 30, count: 5, dx: 45, x: 1060, y: 380 },
      { arc: 60, count: 5, dx: 40, x: 1660, y: 420 },
      { count: 5, dx: 45, x: 1900, y: 490 },
      { count: 5, dx: 40, x: 1980, y: 370 },
      { arc: 45, count: 4, dx: 38, x: 2180, y: 330 },
      { arc: 60, count: 4, dx: 30, x: 2350, y: 440 },
      { count: 6, dx: 45, x: 2540, y: 490 },
    ],
    enemies: [
      { range: 130, type: 'crawler', x: 560 },
      { type: 'hopper', x: 1050 },
      { range: 60, type: 'crawler', x: 1350 },
      { type: 'hopper', x: 1530 },
      { range: 90, type: 'crawler', x: 2250 },
      { type: 'flyer', x: 2060, y: 330 },
      { type: 'spitter', x: 2690 },
    ],
    ground: [
      [0, 760],
      [930, 1660],
      [1850, 2350],
      [2450, END],
    ],
    hints: [
      {
        keys: 'A / D  para andar   ·   ESPAÇO  para pular',
        touch: 'Use < > para andar e PULO para pular',
        x: 250,
      },
      {
        keys: 'Segure o pulo para saltar mais alto',
        touch: 'Segure PULO para saltar mais alto',
        x: 640,
      },
      {
        keys: 'J  pincel   ·   K  tinta   ·   pise nos inimigos!',
        touch: 'PINCEL, TINTA e pise nos inimigos!',
        x: 470,
      },
      {
        keys: 'SHIFT  dash: esquiva e atravessa ataques',
        touch: 'DASH: esquiva e atravessa ataques',
        x: 1000,
      },
      {
        keys: 'Espinhos machucam. Pule por cima!',
        touch: 'Espinhos machucam. Pule por cima!',
        x: 1210,
      },
      {
        keys: 'Lanternas salvam seu progresso',
        touch: 'Lanternas salvam seu progresso',
        x: 1040,
      },
      {
        keys: 'Reúna os 3 cristais para abrir o portão do chefe',
        touch: 'Reúna os 3 cristais para abrir o portão',
        x: 2500,
      },
    ],
    ice: false,
    id: 1,
    intro: 'A Sombra Errante roubou o verde-água do mundo.',
    length: 3000,
    movers: [{ axis: 'x', duration: 2400, range: 90, w: 80, x: 1680, y: 465 }],
    musicRoot: 110,
    name: 'O COMEÇO',
    platforms: [
      { w: 90, x: 845, y: 470 },
      { w: 150, x: 1120, y: 425 },
      { w: 140, x: 1330, y: 365 },
      { kind: 'crumble', w: 90, x: 1550, y: 390 },
      { w: 180, x: 2060, y: 415 },
      { kind: 'crumble', w: 90, x: 2385, y: 455 },
    ],
    shards: [
      { x: 1330, y: 325 },
      { x: 1755, y: 430 },
      { x: 2060, y: 375 },
    ],
    spikes: [
      { w: 110, x: 1210 },
      { w: 120, x: 1500 },
      { w: 90, x: 2140 },
      { w: 85, x: 2760 },
    ],
    thorns: [
      { offset: 0, period: 3000, w: 72, x: 650 },
      { offset: 900, period: 3200, w: 72, x: 1960 },
    ],
  },
  2: {
    accent: 0xe15b72,
    bossHealth: 44,
    bossId: 'skull',
    bossName: 'GUARDIÃO DO ECLIPSE',
    bossTexture: KEY.SPRITESHEET.BOSS_SKULL,
    bossTint: 0xffd9df,
    checkpoints: [1930, 3180],
    colorName: 'Carmim',
    drips: [
      { offset: 0, period: 2600, x: 1100 },
      { offset: 900, period: 2600, x: 2100 },
      { offset: 400, period: 2600, x: 2200 },
    ],
    drops: [
      { count: 5, dx: 45, x: 250, y: 490 },
      { count: 6, dx: 40, x: 690, y: 420 },
      { count: 5, dx: 45, x: 1030, y: 490 },
      { arc: 40, count: 4, dx: 40, x: 1150, y: 360 },
      { arc: 60, count: 6, dx: 40, x: 1560, y: 400 },
      { count: 5, dx: 45, x: 1920, y: 490 },
      { count: 5, dx: 40, x: 2020, y: 340 },
      { count: 5, dx: 40, x: 2350, y: 420 },
      { arc: 55, count: 5, dx: 38, x: 2480, y: 350 },
      { count: 6, dx: 45, x: 2640, y: 490 },
    ],
    enemies: [
      { range: 110, type: 'crawler', x: 400 },
      { type: 'flyer', x: 800, y: 340 },
      { type: 'hopper', x: 1200 },
      { type: 'flyer', x: 1650, y: 330 },
      { range: 100, type: 'crawler', x: 2000 },
      { type: 'spitter', x: 2180 },
      { type: 'flyer', x: 2450, y: 340 },
      { range: 100, type: 'crawler', x: 2800 },
      { type: 'hopper', x: 3050 },
    ],
    ground: [
      [0, 640],
      [1010, 1500],
      [1900, 2300],
      [2620, END],
    ],
    ice: false,
    id: 2,
    intro: 'O Guardião do Eclipse levou o carmim das ilhas flutuantes.',
    length: 3300,
    movers: [
      { axis: 'x', duration: 2200, range: 230, w: 110, x: 700, y: 470 },
      { axis: 'x', duration: 2000, range: 200, w: 110, x: 2340, y: 470 },
      { axis: 'y', duration: 2300, range: 105, w: 90, x: 1820, y: 335 },
    ],
    musicRoot: 146.83,
    name: 'A DERIVA',
    platforms: [
      { w: 160, x: 1200, y: 400 },
      { w: 120, x: 1360, y: 330 },
      { w: 100, x: 1585, y: 470 },
      { w: 100, x: 1745, y: 430 },
      { w: 160, x: 2100, y: 395 },
      { kind: 'crumble', w: 90, x: 2860, y: 420 },
    ],
    shards: [
      { x: 1360, y: 290 },
      { x: 1745, y: 390 },
      { x: 2100, y: 355 },
    ],
    spikes: [
      { w: 90, x: 420 },
      { w: 90, x: 1250 },
      { w: 100, x: 2050 },
      { w: 85, x: 2900 },
    ],
    thorns: [
      { offset: 200, period: 2600, w: 75, x: 1120 },
      { offset: 1100, period: 2800, w: 75, x: 2730 },
    ],
  },
  3: {
    accent: 0x76d36f,
    bossHealth: 52,
    bossId: 'thorn',
    bossName: 'MÃE DAS RAÍZES',
    bossTexture: KEY.SPRITESHEET.BOSS_THORN,
    bossTint: 0xb7e0a8,
    checkpoints: [1700, 3480],
    colorName: 'Verde-folha',
    drips: [
      { offset: 300, period: 2900, x: 1320 },
      { offset: 1500, period: 3000, x: 2830 },
    ],
    drops: [
      { count: 5, dx: 45, x: 250, y: 490 },
      { arc: 60, count: 4, dx: 35, x: 740, y: 430 },
      { count: 5, dx: 40, x: 900, y: 490 },
      { arc: 40, count: 5, dx: 40, x: 1050, y: 370 },
      { arc: 60, count: 5, dx: 40, x: 1460, y: 420 },
      { count: 5, dx: 45, x: 1700, y: 490 },
      { count: 5, dx: 40, x: 1830, y: 360 },
      { arc: 50, count: 5, dx: 40, x: 2210, y: 420 },
      { count: 5, dx: 40, x: 2570, y: 350 },
      { arc: 55, count: 5, dx: 38, x: 2860, y: 405 },
      { count: 6, dx: 45, x: 3080, y: 490 },
    ],
    enemies: [
      { range: 120, type: 'crawler', x: 450 },
      { type: 'spitter', x: 1200 },
      { type: 'flyer', x: 1350, y: 320 },
      { range: 100, type: 'crawler', x: 1800 },
      { type: 'spitter', x: 2000 },
      { type: 'hopper', x: 2500 },
      { type: 'spitter', x: 2750 },
      { type: 'flyer', x: 3000, y: 340 },
      { range: 110, type: 'brute', x: 3250 },
    ],
    ground: [
      [0, 700],
      [860, 1450],
      [1640, 2200],
      [2380, 2900],
      [3060, END],
    ],
    ice: false,
    id: 3,
    intro: 'A Mãe das Raízes sufocou o verde do jardim silencioso.',
    length: 3600,
    movers: [
      { axis: 'y', duration: 2200, range: 100, w: 90, x: 1515, y: 350 },
      { axis: 'x', duration: 2100, range: 100, w: 90, x: 2920, y: 455 },
    ],
    musicRoot: 174.61,
    name: 'JARDIM SEM VOZ',
    platforms: [
      { kind: 'crumble', w: 90, x: 780, y: 480 },
      { w: 160, x: 1120, y: 420 },
      { kind: 'crumble', w: 120, x: 1300, y: 350 },
      { kind: 'crumble', w: 90, x: 1545, y: 470 },
      { w: 170, x: 1900, y: 410 },
      { kind: 'crumble', w: 90, x: 2290, y: 470 },
      { w: 150, x: 2640, y: 400 },
      { kind: 'crumble', w: 80, x: 2980, y: 470 },
    ],
    shards: [
      { x: 1300, y: 310 },
      { x: 1900, y: 370 },
      { x: 2640, y: 360 },
    ],
    spikes: [
      { w: 80, x: 380 },
      { w: 90, x: 1280 },
      { w: 100, x: 2050 },
      { w: 90, x: 2740 },
      { w: 85, x: 3300 },
    ],
    thorns: [
      { offset: 0, period: 2400, w: 80, x: 1000 },
      { offset: 600, period: 2200, w: 80, x: 1750 },
      { offset: 300, period: 2400, w: 80, x: 2550 },
      { offset: 1200, period: 2300, w: 80, x: 3180 },
    ],
  },
  4: {
    accent: 0x62cbea,
    bossHealth: 60,
    bossId: 'mirror',
    bossName: 'REFLEXO PARTIDO',
    bossTexture: KEY.SPRITESHEET.BOSS_MIRROR,
    bossTint: 0xb8efff,
    checkpoints: [2250, 3780],
    colorName: 'Azul-gelo',
    drips: [
      { offset: 200, period: 2800, x: 1000 },
      { offset: 1200, period: 2800, x: 2500 },
      { offset: 700, period: 2600, x: 3250 },
    ],
    drops: [
      { count: 5, dx: 45, x: 250, y: 490 },
      { arc: 60, count: 4, dx: 35, x: 620, y: 430 },
      { arc: 40, count: 5, dx: 40, x: 960, y: 370 },
      { arc: 60, count: 5, dx: 40, x: 1340, y: 420 },
      { count: 5, dx: 40, x: 1620, y: 360 },
      { arc: 60, count: 4, dx: 35, x: 2020, y: 430 },
      { count: 5, dx: 40, x: 2380, y: 340 },
      { arc: 60, count: 4, dx: 35, x: 2740, y: 430 },
      { count: 5, dx: 40, x: 3040, y: 370 },
      { arc: 50, count: 5, dx: 36, x: 3250, y: 420 },
      { count: 6, dx: 45, x: 3500, y: 490 },
    ],
    enemies: [
      { range: 110, type: 'crawler', x: 400 },
      { range: 140, type: 'brute', x: 950 },
      { type: 'flyer', x: 1250, y: 320 },
      { type: 'spitter', x: 1750 },
      { range: 140, type: 'brute', x: 2350 },
      { type: 'hopper', x: 2500 },
      { type: 'flyer', x: 2700, y: 330 },
      { range: 140, type: 'brute', x: 3050 },
      { type: 'spitter', x: 3150 },
      { type: 'flyer', x: 3520, y: 300 },
    ],
    ground: [
      [0, 600],
      [760, 1300],
      [1500, 1950],
      [2200, 2700],
      [2900, 3300],
      [3480, END],
    ],
    ice: true,
    id: 4,
    intro: 'O Reflexo Partido congelou o azul no mar de vidro.',
    length: 3900,
    movers: [
      { axis: 'x', duration: 2000, range: 160, w: 110, x: 1560, y: 330 },
      { axis: 'y', duration: 2100, range: 120, w: 90, x: 2130, y: 330 },
      { axis: 'x', duration: 1900, range: 110, w: 80, x: 3320, y: 455 },
    ],
    musicRoot: 164.81,
    name: 'MAR DE VIDRO',
    platforms: [
      { kind: 'crumble', w: 80, x: 680, y: 470 },
      { w: 140, x: 1030, y: 410 },
      { kind: 'crumble', w: 80, x: 1400, y: 460 },
      { w: 150, x: 1720, y: 400 },
      { kind: 'crumble', w: 80, x: 2075, y: 470 },
      { w: 150, x: 2450, y: 395 },
      { kind: 'crumble', w: 80, x: 2800, y: 470 },
      { w: 140, x: 3100, y: 410 },
      { kind: 'crumble', w: 80, x: 3390, y: 470 },
      { kind: 'crumble', w: 100, x: 3650, y: 390 },
    ],
    shards: [
      { x: 1030, y: 370 },
      { x: 1720, y: 360 },
      { x: 3100, y: 370 },
    ],
    spikes: [
      { w: 100, x: 450 },
      { w: 90, x: 1180 },
      { w: 90, x: 1850 },
      { w: 100, x: 2450 },
      { w: 85, x: 3180 },
    ],
    thorns: [
      { offset: 0, period: 2000, w: 80, x: 1150 },
      { offset: 500, period: 2000, w: 80, x: 2600 },
      { offset: 1200, period: 2200, w: 80, x: 3550 },
    ],
  },
  5: {
    accent: 0xf2b84b,
    bossHealth: 80,
    bossId: 'heart',
    bossName: 'CORAÇÃO DO VAZIO',
    bossTexture: KEY.SPRITESHEET.BOSS_HEART,
    bossTint: 0xffc5ae,
    checkpoints: [2200, 4280],
    colorName: 'Ouro',
    drips: [
      { offset: 0, period: 2400, x: 900 },
      { offset: 800, period: 2400, x: 1900 },
      { offset: 400, period: 2400, x: 3200 },
      { offset: 1200, period: 2200, x: 3900 },
    ],
    drops: [
      { count: 5, dx: 45, x: 250, y: 490 },
      { arc: 60, count: 4, dx: 35, x: 560, y: 430 },
      { count: 5, dx: 40, x: 780, y: 490 },
      { arc: 50, count: 5, dx: 40, x: 1150, y: 400 },
      { count: 5, dx: 40, x: 1350, y: 360 },
      { arc: 60, count: 5, dx: 35, x: 1750, y: 420 },
      { count: 5, dx: 40, x: 1950, y: 490 },
      { arc: 60, count: 4, dx: 35, x: 2280, y: 420 },
      { count: 5, dx: 40, x: 2480, y: 360 },
      { arc: 60, count: 5, dx: 35, x: 2830, y: 420 },
      { count: 5, dx: 40, x: 3050, y: 350 },
      { count: 5, dx: 38, x: 3260, y: 300 },
      { arc: 60, count: 4, dx: 35, x: 3440, y: 430 },
      { count: 6, dx: 45, x: 3650, y: 490 },
    ],
    enemies: [
      { range: 110, type: 'crawler', x: 350 },
      { type: 'hopper', x: 800 },
      { type: 'spitter', x: 1000 },
      { type: 'flyer', x: 1200, y: 320 },
      { range: 130, type: 'brute', x: 1500 },
      { type: 'flyer', x: 1800, y: 330 },
      { type: 'spitter', x: 2050 },
      { range: 130, type: 'brute', x: 2620 },
      { type: 'hopper', x: 2650 },
      { type: 'flyer', x: 2900, y: 320 },
      { range: 130, type: 'brute', x: 3200 },
      { type: 'spitter', x: 3300 },
      { type: 'hopper', x: 3700 },
      { type: 'flyer', x: 3950, y: 300 },
      { range: 120, type: 'brute', x: 4100 },
    ],
    ground: [
      [0, 520],
      [700, 1100],
      [1300, 1700],
      [1900, 2250],
      [2450, 2800],
      [3000, 3400],
      [3620, END],
    ],
    ice: false,
    id: 5,
    intro: 'O Coração do Vazio guarda o ouro. Restaure todas as cores.',
    length: 4400,
    movers: [
      { axis: 'x', duration: 2100, range: 150, w: 110, x: 545, y: 470 },
      { axis: 'y', duration: 2000, range: 110, w: 90, x: 1810, y: 340 },
      { axis: 'x', duration: 1900, range: 100, w: 85, x: 2850, y: 445 },
      { axis: 'y', duration: 1900, range: 130, w: 110, x: 3510, y: 470 },
    ],
    musicRoot: 130.81,
    name: 'CORAÇÃO DA TINTA',
    platforms: [
      { kind: 'crumble', w: 80, x: 640, y: 480 },
      { w: 130, x: 1150, y: 400 },
      { kind: 'crumble', w: 90, x: 1350, y: 350 },
      { kind: 'crumble', w: 90, x: 1800, y: 440 },
      { w: 130, x: 2280, y: 420 },
      { kind: 'crumble', w: 90, x: 2500, y: 350 },
      { kind: 'crumble', w: 90, x: 2900, y: 440 },
      { kind: 'solid', w: 90, x: 3080, y: 450 },
      { w: 130, x: 3220, y: 365 },
      { kind: 'crumble', w: 90, x: 3450, y: 430 },
    ],
    shards: [
      { x: 1350, y: 310 },
      { x: 2500, y: 310 },
      { x: 3220, y: 325 },
    ],
    spikes: [
      { w: 100, x: 400 },
      { w: 100, x: 1550 },
      { w: 90, x: 2150 },
      { w: 90, x: 2650 },
      { w: 100, x: 3300 },
      { w: 90, x: 4000 },
    ],
    thorns: [
      { offset: 0, period: 2100, w: 80, x: 900 },
      { offset: 500, period: 2100, w: 80, x: 2050 },
      { offset: 900, period: 2100, w: 80, x: 3200 },
      { offset: 1300, period: 1900, w: 80, x: 3800 },
    ],
  },
};
