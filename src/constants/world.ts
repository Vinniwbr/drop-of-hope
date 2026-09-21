export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 600;
/** Supersampling adaptativo: Full HD usa 2x e telas 4K usam 3x. */
export const RENDER_SCALE = Math.min(
  3,
  Math.max(2, Math.ceil(window.screen.width / GAME_WIDTH)),
);
export const PHASE_COUNT = 5;

/** Chao das fases: topo da superficie onde o personagem pisa. */
export const GROUND_TOP = 520;

/** Largura da arena do chefe, no fim de cada fase. */
export const ARENA_WIDTH = 860;

/**
 * Medidas das folhas do personagem geradas por `npm run sprites`
 * (ver public/sprites/hope/hope-meta.json). Todos os quadros compartilham
 * a mesma ancora: o centro do corpo, com os pes em ANCHOR_Y.
 */
export const HOPE = {
  ANCHOR_X: 152,
  ANCHOR_Y: 155,
  BODY_HEIGHT: 132,
  FRAME_HEIGHT: 224,
  FRAME_WIDTH: 304,
  SCALE: 0.5,
} as const;

export const BOSS_FRAME = 443;
