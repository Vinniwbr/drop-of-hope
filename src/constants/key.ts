export const IMAGE = {
  LOBBY_MAP: 'LOBBY_MAP',
  MAIN_LOBBY: 'MAIN_LOBBY',
} as const;

export const SCENE = {
  AUTH: 'AUTH',
  BOOT: 'BOOT',
  ENDING: 'ENDING',
  GAME_PHASE: 'GAME_PHASE',
  LOBBY: 'LOBBY',
  MENU: 'MENU',
} as const;

export const SPRITESHEET = {
  BOSS_HEART: 'BOSS_HEART',
  BOSS_MIRROR: 'BOSS_MIRROR',
  BOSS_SHADOW: 'BOSS_SHADOW',
  BOSS_SKULL: 'BOSS_SKULL',
  BOSS_THORN: 'BOSS_THORN',
  PLAYER_ATTACK: 'PLAYER_ATTACK',
  PLAYER_CROUCH: 'PLAYER_CROUCH',
  PLAYER_IDLE: 'PLAYER_IDLE',
  PLAYER_RUN: 'PLAYER_RUN',
  PROJECTILE_INK: 'PROJECTILE_INK',
} as const;

/** Chave da textura do cenario em preto e branco da fase. */
export function backgroundKey(phaseId: number) {
  return `BACKGROUND_PHASE_${String(phaseId)}`;
}

/** Chave da textura do cenario colorido da fase. */
export function backgroundColorKey(phaseId: number) {
  return `BACKGROUND_PHASE_${String(phaseId)}_COLOR`;
}
