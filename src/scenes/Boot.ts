import Phaser from 'phaser';

import {
  BOSS_FRAME,
  GAME_HEIGHT,
  GAME_WIDTH,
  HOPE,
  KEY,
  PHASE_COUNT,
} from '../constants';
import { PHASES } from '../data/phases';
import { configureHighResolutionCamera } from '../graphics/rendering';
import { createTextures } from '../graphics/textures';
import { AuthApi, loadColorInfo, refreshWeather } from '../services';
import { textStyle } from '../ui/widgets';

export class Boot extends Phaser.Scene {
  constructor() {
    super(KEY.SCENE.BOOT);
  }

  preload() {
    configureHighResolutionCamera(this);
    this.createLoadingBar();

    const hope = {
      frameHeight: HOPE.FRAME_HEIGHT,
      frameWidth: HOPE.FRAME_WIDTH,
    };
    const sheets: [string, string][] = [
      [KEY.SPRITESHEET.PLAYER_IDLE, 'hope-idle'],
      [KEY.SPRITESHEET.PLAYER_RUN, 'hope-run'],
      [KEY.SPRITESHEET.PLAYER_CROUCH, 'hope-crouch'],
      [KEY.SPRITESHEET.PLAYER_ATTACK, 'hope-brush-attack'],
      [KEY.SPRITESHEET.PROJECTILE_INK, 'hope-ink-projectile'],
    ];
    for (const [key, file] of sheets) {
      this.load.spritesheet(key, `sprites/hope/${file}.png`, hope);
    }

    const boss = { frameHeight: BOSS_FRAME, frameWidth: BOSS_FRAME };
    this.load.spritesheet(
      KEY.SPRITESHEET.BOSS_SHADOW,
      'sprites/bosses/shadow-boss.webp',
      boss,
    );
    this.load.spritesheet(
      KEY.SPRITESHEET.BOSS_SKULL,
      'sprites/bosses/skull-boss.webp',
      boss,
    );
    this.load.spritesheet(
      KEY.SPRITESHEET.BOSS_THORN,
      'sprites/bosses/thorn-boss.webp',
      boss,
    );
    this.load.spritesheet(
      KEY.SPRITESHEET.BOSS_MIRROR,
      'sprites/bosses/mirror-boss.webp',
      boss,
    );
    this.load.spritesheet(
      KEY.SPRITESHEET.BOSS_HEART,
      'sprites/bosses/heart-boss.webp',
      boss,
    );

    for (let phase = 1; phase <= PHASE_COUNT; phase++) {
      this.load.image(
        KEY.backgroundKey(phase),
        `backgrounds/phase-${String(phase)}.webp`,
      );
      this.load.image(
        KEY.backgroundColorKey(phase),
        `backgrounds/phase-${String(phase)}-color.webp`,
      );
    }
    this.load.image(KEY.IMAGE.LOBBY_MAP, 'backgrounds/lobby-map.webp');
    this.load.image(KEY.IMAGE.MAIN_LOBBY, 'backgrounds/main-lobby.webp');
  }

  create() {
    createTextures(this);
    this.applySmoothTextureFiltering();
    // Dados das APIs externas: carregam em segundo plano e nunca bloqueiam o jogo.
    void refreshWeather();
    for (const phase of Object.values(PHASES)) {
      void loadColorInfo(phase.accent, phase.colorName);
    }
    void this.enter();
  }

  private applySmoothTextureFiltering() {
    for (const key of this.textures.getTextureKeys()) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  private async enter() {
    const session = await AuthApi.restore();
    this.scene.start(session ? KEY.SCENE.MENU : KEY.SCENE.AUTH);
  }

  private createLoadingBar() {
    this.cameras.main.setBackgroundColor('#0b0c10');
    this.add
      .text(GAME_WIDTH / 2, 240, 'DROP OF HOPE', textStyle(42, '#f3f1ec'))
      .setOrigin(0.5);
    this.add
      .rectangle(GAME_WIDTH / 2, 320, 420, 14, 0x000000, 0.7)
      .setStrokeStyle(2, 0x7b7d86);
    const bar = this.add
      .rectangle(GAME_WIDTH / 2 - 208, 320, 0, 8, 0x47c7ad, 1)
      .setOrigin(0, 0.5);
    const label = this.add
      .text(
        GAME_WIDTH / 2,
        352,
        'Carregando...',
        textStyle(13, '#9ea1a8', 'monospace', false),
      )
      .setOrigin(0.5);
    this.load.on('progress', (value: number) => {
      bar.width = 416 * value;
      label.setText(`Carregando... ${String(Math.round(value * 100))}%`);
    });
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 40,
        'Devolva as cores ao mundo',
        textStyle(14, '#6e717a', 'Georgia, serif', false),
      )
      .setOrigin(0.5);
  }
}
