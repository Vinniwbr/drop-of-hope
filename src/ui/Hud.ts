import Phaser from 'phaser';

import { GAME_WIDTH, RENDER_SCALE } from '../constants';
import type { PhaseConfig } from '../data/phases';
import { TEX } from '../graphics/textures';

const DEPTH = 100;

function style(
  size: number,
  color = '#ffffff',
  family = 'Georgia, serif',
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    color,
    fontFamily: family,
    fontSize: `${String(size)}px`,
    resolution: RENDER_SCALE,
    stroke: '#000000',
    strokeThickness: Math.max(3, Math.round(size / 4)),
  };
}

export class Hud {
  private scene: Phaser.Scene;
  private accent: number;
  private hearts: Phaser.GameObjects.Image[] = [];
  private inkBar: Phaser.GameObjects.Rectangle;
  private inkLabel: Phaser.GameObjects.Text;
  private inkFrame: Phaser.GameObjects.Rectangle;
  private dropsText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private objective: Phaser.GameObjects.Text;
  private weatherText: Phaser.GameObjects.Text;
  private shards: Phaser.GameObjects.Image[] = [];
  private bossBack: Phaser.GameObjects.Rectangle;
  private bossBar: Phaser.GameObjects.Rectangle;
  private bossName: Phaser.GameObjects.Text;
  private bossTicks: Phaser.GameObjects.Rectangle[] = [];
  private inkReady = false;
  private novaHint: string;
  private hurtOverlay: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, config: PhaseConfig, touch: boolean) {
    this.scene = scene;
    this.accent = config.accent;
    this.novaHint = touch ? 'NOVA PRONTA' : 'NOVA PRONTA  [E]';

    const fixed = <
      T extends Phaser.GameObjects.GameObject & {
        setScrollFactor: (v: number) => T;
        setDepth: (v: number) => T;
      },
    >(
      object: T,
    ) => object.setScrollFactor(0).setDepth(DEPTH);

    fixed(
      scene.add.text(
        40,
        22,
        `FASE ${String(config.id)}  ·  ${config.name}`,
        style(20),
      ),
    );

    for (let index = 0; index < 5; index++) {
      this.hearts.push(
        fixed(scene.add.image(50 + index * 34, 74, TEX.HEART_FULL)).setScale(1),
      );
    }

    this.inkFrame = fixed(
      scene.add.rectangle(40, 110, 178, 14, 0x050609, 0.85).setOrigin(0, 0.5),
    ).setStrokeStyle(2, 0x8a8d96);
    this.inkBar = fixed(
      scene.add.rectangle(43, 110, 0, 8, 0xc38bff, 1).setOrigin(0, 0.5),
    ).setDepth(DEPTH + 1);
    this.inkLabel = fixed(
      scene.add.text(40, 122, 'TINTA', style(11, '#c9cbd2', 'monospace')),
    );

    this.dropsText = fixed(
      scene.add
        .text(GAME_WIDTH - 40, 22, 'GOTAS 0', style(15, '#ffffff', 'monospace'))
        .setOrigin(1, 0),
    );
    this.scoreText = fixed(
      scene.add
        .text(GAME_WIDTH - 40, 44, '0 PTS', style(13, '#c9cbd2', 'monospace'))
        .setOrigin(1, 0),
    );
    for (let index = 0; index < 3; index++) {
      this.shards.push(
        fixed(
          scene.add
            .image(GAME_WIDTH - 112 + index * 34, 86, TEX.SHARD)
            .setScale(0.6)
            .setTint(0x3a3c45),
        ),
      );
    }
    this.objective = fixed(
      scene.add
        .text(GAME_WIDTH - 40, 112, '', style(12, '#e6e7ea', 'monospace'))
        .setOrigin(1, 0),
    );
    this.weatherText = fixed(
      scene.add
        .text(40, 148, '', style(11, '#9ea1a8', 'monospace'))
        .setOrigin(0, 0),
    );

    this.bossBack = fixed(
      scene.add.rectangle(340, 562, 520, 18, 0x050609, 0.9).setOrigin(0, 0.5),
    )
      .setStrokeStyle(2, 0xc4c5ca)
      .setVisible(false);
    this.bossBar = fixed(
      scene.add
        .rectangle(343, 562, 514, 10, config.accent, 1)
        .setOrigin(0, 0.5),
    )
      .setDepth(DEPTH + 1)
      .setVisible(false);
    this.bossName = fixed(
      scene.add
        .text(GAME_WIDTH / 2, 534, config.bossName, style(17))
        .setOrigin(0.5),
    ).setVisible(false);
    for (const ratio of [0.34, 0.67]) {
      this.bossTicks.push(
        fixed(scene.add.rectangle(343 + 514 * ratio, 562, 2, 18, 0xffffff, 0.8))
          .setDepth(DEPTH + 2)
          .setVisible(false),
      );
    }

    this.hurtOverlay = scene.add
      .rectangle(GAME_WIDTH / 2, 300, GAME_WIDTH, 600, 0xb0122a, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH - 2);
  }

  setHealth(current: number, max: number) {
    this.hearts.forEach((heart, index) => {
      heart.setVisible(index < max);
      heart.setTexture(index < current ? TEX.HEART_FULL : TEX.HEART_EMPTY);
    });
  }

  pulseHeart(index: number) {
    const heart = this.hearts[index] as Phaser.GameObjects.Image | undefined;
    if (!heart) return;
    this.scene.tweens.add({
      duration: 160,
      scale: 1.4,
      targets: heart,
      yoyo: true,
    });
  }

  flashDamage() {
    this.hurtOverlay.setAlpha(0.35);
    this.scene.tweens.add({
      alpha: 0,
      duration: 380,
      targets: this.hurtOverlay,
    });
  }

  setInk(ratio: number) {
    this.inkBar.width = 172 * Phaser.Math.Clamp(ratio, 0, 1);
    const ready = ratio >= 1;
    if (ready !== this.inkReady) {
      this.inkReady = ready;
      this.inkLabel.setText(ready ? this.novaHint : 'TINTA');
      this.inkLabel.setColor(ready ? '#e0c4ff' : '#c9cbd2');
      if (ready) {
        this.scene.tweens.add({
          alpha: 0.5,
          duration: 380,
          repeat: 5,
          targets: this.inkFrame,
          yoyo: true,
        });
      }
    }
  }

  setDrops(count: number, total: number) {
    this.dropsText.setText(`GOTAS ${String(count)}/${String(total)}`);
  }

  setScore(score: number) {
    this.scoreText.setText(`${String(score)} PTS`);
  }

  setShards(count: number) {
    this.shards.forEach((shard, index) => {
      const lit = index < count;
      shard.setTint(lit ? this.accent : 0x3a3c45);
      if (lit && index === count - 1) {
        this.scene.tweens.add({
          duration: 200,
          scale: 0.95,
          targets: shard,
          yoyo: true,
        });
      }
    });
  }

  setObjective(text: string) {
    this.objective.setText(text);
  }

  setWeather(text: string) {
    this.weatherText.setText(text);
  }

  showBoss(name?: string) {
    if (name) this.bossName.setText(name);
    this.bossBack.setVisible(true);
    this.bossBar.setVisible(true);
    this.bossName.setVisible(true);
    for (const tick of this.bossTicks) tick.setVisible(true);
  }

  hideBoss() {
    this.bossBack.setVisible(false);
    this.bossBar.setVisible(false);
    this.bossName.setVisible(false);
    for (const tick of this.bossTicks) tick.setVisible(false);
  }

  setBoss(ratio: number) {
    this.scene.tweens.add({
      duration: 160,
      targets: this.bossBar,
      width: 514 * Phaser.Math.Clamp(ratio, 0, 1),
    });
  }

  /** Faixa grande no centro da tela (inicio de fase, fases do chefe, avisos). */
  banner(title: string, subtitle = '', hold = 1300) {
    const text = this.scene.add
      .text(GAME_WIDTH / 2, 210, title, style(40))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 20)
      .setAlpha(0)
      .setScale(0.9);
    const sub = this.scene.add
      .text(GAME_WIDTH / 2, 258, subtitle, style(15, '#dfe1e6', 'monospace'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 20)
      .setAlpha(0);
    this.scene.tweens.add({
      alpha: 1,
      duration: 300,
      ease: 'Back.Out',
      hold,
      onComplete: () => {
        text.destroy();
        sub.destroy();
      },
      scale: 1,
      targets: [text, sub],
      yoyo: true,
    });
  }
}
