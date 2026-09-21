import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, KEY, PHASE_COUNT } from '../constants';
import { PHASES } from '../data/phases';
import { configureHighResolutionCamera } from '../graphics/rendering';
import { TEX } from '../graphics/textures';
import { getSession, peekColorInfo, ProgressApi } from '../services';
import { audio } from '../systems/audio';
import { createButton, textStyle } from '../ui/widgets';

/** Cena final: todas as cores voltaram. Mostra o resumo e a paleta completa. */
export class Ending extends Phaser.Scene {
  constructor() {
    super(KEY.SCENE.ENDING);
  }

  create() {
    configureHighResolutionCamera(this);
    const progress = ProgressApi.get();
    this.cameras.main.setBackgroundColor('#0b0c10');
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, KEY.backgroundColorKey(5))
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setAlpha(0.5);
    this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x05060a,
      0.55,
    );

    audio.playMusic('menu', 196);
    audio.sfx('win');

    const title = this.add
      .text(GAME_WIDTH / 2, 92, 'AS CORES VOLTARAM', textStyle(56))
      .setOrigin(0.5)
      .setAlpha(0);
    const sub = this.add
      .text(
        GAME_WIDTH / 2,
        148,
        `${getSession()?.username ?? 'Viajante'}, você devolveu a esperança ao mundo.`,
        textStyle(19, '#dfe1e6', 'Georgia, serif', false),
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ alpha: 1, duration: 1400, targets: [title, sub] });

    const phases = Object.values(PHASES);
    phases.forEach((phase, index) => {
      const x = GAME_WIDTH / 2 + (index - (phases.length - 1) / 2) * 150;
      const info = peekColorInfo(phase.accent, phase.colorName);
      const glow = this.add
        .image(x, 268, TEX.GLOW)
        .setTint(phase.accent)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.6)
        .setAlpha(0);
      const orb = this.add
        .circle(x, 268, 32, phase.accent, 1)
        .setStrokeStyle(3, 0xffffff, 0.9)
        .setAlpha(0)
        .setScale(0.3);
      const label = this.add
        .text(
          x,
          326,
          info.name,
          textStyle(14, '#ffffff', 'Georgia, serif', false),
        )
        .setOrigin(0.5)
        .setAlpha(0);
      const boss = this.add
        .text(
          x,
          348,
          phase.bossName,
          textStyle(9, '#8f929a', 'monospace', false),
        )
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({
        alpha: 1,
        delay: 900 + index * 350,
        duration: 600,
        ease: 'Back.Out',
        scale: 1,
        targets: orb,
      });
      this.tweens.add({
        alpha: 0.7,
        delay: 900 + index * 350,
        duration: 600,
        targets: [glow, label, boss],
      });
      this.tweens.add({
        alpha: 0.35,
        delay: 1600 + index * 350,
        duration: 1200,
        repeat: -1,
        targets: glow,
        yoyo: true,
      });
    });

    const minutes = Math.round(progress.stats.playMs / 60000);
    this.add
      .text(
        GAME_WIDTH / 2,
        420,
        `PONTUAÇÃO TOTAL  ${String(progress.totalScore)}    ·    FASES  ${String(progress.completedPhases.length)}/${String(PHASE_COUNT)}    ·    GOTAS  ${String(progress.stats.drops)}    ·    TEMPO  ${String(minutes)} MIN`,
        textStyle(14, '#e4e5ea', 'monospace', false),
      )
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2 - 150, 500, 'VOLTAR AO MAPA', () => {
      this.scene.start(KEY.SCENE.LOBBY);
    });
    createButton(this, GAME_WIDTH / 2 + 150, 500, 'MENU PRINCIPAL', () => {
      this.scene.start(KEY.SCENE.MENU);
    });
    this.cameras.main.fadeIn(900, 0, 0, 0);
  }
}
