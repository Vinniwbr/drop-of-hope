import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, HOPE, KEY, PHASE_COUNT } from '../constants';
import { PHASES } from '../data/phases';
import { configureHighResolutionCamera } from '../graphics/rendering';
import { TEX } from '../graphics/textures';
import { peekColorInfo, ProgressApi } from '../services';
import { audio } from '../systems/audio';
import { textStyle } from '../ui/widgets';

const LOBBY_IDLE = 'LOBBY_HOPE_IDLE';
const LOBBY_RUN = 'LOBBY_HOPE_RUN';

interface PhaseNode {
  avatarX: number;
  avatarY: number;
  complete: boolean;
  glow?: Phaser.GameObjects.Image;
  phaseId: number;
  ring: Phaser.GameObjects.Arc;
  unlocked: boolean;
  zone: Phaser.GameObjects.Zone;
}

/** Posicoes dos cinco pontos sobre a arte do mapa: [x, y]. */
const NODE_POSITIONS: [number, number][] = [
  [448, 337],
  [702, 337],
  [701, 74],
  [1084, 74],
  [1116, 512],
];

export class Lobby extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Sprite;
  private description!: Phaser.GameObjects.Text;
  private lastNode = 0;
  private nodes: PhaseNode[] = [];
  private selectedNode = 0;
  private startingPhase = false;

  constructor() {
    super(KEY.SCENE.LOBBY);
  }

  create() {
    configureHighResolutionCamera(this);
    this.nodes = [];
    this.startingPhase = false;
    this.createAnimations();
    this.cameras.main.setBackgroundColor('#c7c5c6');
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, KEY.IMAGE.LOBBY_MAP)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(600, 300, 1200, 600, 0x000000, 0.07);

    this.add
      .text(28, 22, 'DROP OF HOPE', {
        ...textStyle(28, '#111114', 'Georgia, serif', false),
        stroke: '#f0eff0',
        strokeThickness: 4,
      })
      .setDepth(20);
    this.add
      .text(GAME_WIDTH - 28, 28, 'MENU', {
        ...textStyle(15, '#191a1e', 'monospace', false),
        stroke: '#f0eff0',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(20)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.goToMenu();
      });

    NODE_POSITIONS.forEach(([x, y], index) => {
      this.createPhaseNode(index + 1, x, y);
    });

    this.lastNode =
      (this.registry.get('last-phase-node') as number | undefined) ??
      this.firstOpenNode();
    this.selectedNode = this.findClosestUnlocked(this.lastNode);
    const selected = this.nodes[this.selectedNode];
    this.avatar = this.add
      .sprite(
        selected.avatarX,
        selected.avatarY,
        KEY.SPRITESHEET.PLAYER_IDLE,
        0,
      )
      .setOrigin(
        HOPE.ANCHOR_X / HOPE.FRAME_WIDTH,
        HOPE.ANCHOR_Y / HOPE.FRAME_HEIGHT,
      )
      .setScale(0.5)
      .setDepth(18)
      .play(LOBBY_IDLE);

    this.createBottomBar();

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-LEFT', () => {
      this.moveSelection(-1);
    });
    keyboard?.on('keydown-A', () => {
      this.moveSelection(-1);
    });
    keyboard?.on('keydown-RIGHT', () => {
      this.moveSelection(1);
    });
    keyboard?.on('keydown-D', () => {
      this.moveSelection(1);
    });
    keyboard?.on('keydown-UP', () => {
      this.moveSelection(1);
    });
    keyboard?.on('keydown-DOWN', () => {
      this.moveSelection(-1);
    });
    keyboard?.on('keydown-ENTER', () => {
      this.startSelectedPhase();
    });
    keyboard?.on('keydown-SPACE', () => {
      this.startSelectedPhase();
    });
    keyboard?.on('keydown-ESC', () => {
      this.goToMenu();
    });

    audio.playMusic('menu', 130.81);
    this.selectNode(this.selectedNode, false);
    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  private firstOpenNode() {
    const progress = ProgressApi.get();
    return Math.min(PHASE_COUNT - 1, progress.completedPhases.length);
  }

  private goToMenu() {
    audio.sfx('click');
    this.scene.start(KEY.SCENE.MENU);
  }

  private createAnimations() {
    if (!this.anims.exists(LOBBY_IDLE)) {
      this.anims.create({
        frameRate: 7,
        frames: this.anims.generateFrameNumbers(KEY.SPRITESHEET.PLAYER_IDLE, {
          end: 7,
          start: 0,
        }),
        key: LOBBY_IDLE,
        repeat: -1,
      });
    }
    if (!this.anims.exists(LOBBY_RUN)) {
      this.anims.create({
        frameRate: 17,
        frames: [1, 2, 3, 4, 9, 8, 7, 6, 5, 4, 3, 2].map((frame) => ({
          frame,
          key: KEY.SPRITESHEET.PLAYER_RUN,
        })),
        key: LOBBY_RUN,
        repeat: -1,
      });
    }
  }

  private createBottomBar() {
    this.add.rectangle(600, 566, 1200, 68, 0x08090d, 0.88).setDepth(25);
    this.description = this.add
      .text(600, 556, '', textStyle(19, '#f0f0f2', 'Georgia, serif', false))
      .setOrigin(0.5)
      .setDepth(26);
    const progress = ProgressApi.get();
    this.add
      .text(
        600,
        580,
        `${String(progress.completedPhases.length)}/${String(PHASE_COUNT)} CORES RESTAURADAS  ·  ${String(progress.totalScore)} PONTOS`,
        textStyle(11, '#9ea1a8', 'monospace', false),
      )
      .setOrigin(0.5)
      .setDepth(26);

    // Paleta: uma amostra por fase (cinza ate a cor voltar).
    for (const phase of Object.values(PHASES)) {
      const done = ProgressApi.isComplete(phase.id);
      this.add
        .circle(
          36 + (phase.id - 1) * 30,
          566,
          10,
          done ? phase.accent : 0x3a3c45,
          1,
        )
        .setStrokeStyle(2, 0xffffff, done ? 0.9 : 0.25)
        .setDepth(26);
    }
  }

  private createPhaseNode(phaseId: number, x: number, y: number) {
    const config = PHASES[phaseId];
    const complete = ProgressApi.isComplete(phaseId);
    const unlocked = ProgressApi.isUnlocked(phaseId);
    const ringColor = complete ? config.accent : unlocked ? 0x202024 : 0x4b4c51;
    const ring = this.add
      .circle(
        x,
        y,
        complete ? 27 : 24,
        complete ? config.accent : 0xffffff,
        complete ? 0.35 : 0.08,
      )
      .setStrokeStyle(complete ? 4 : 3, ringColor)
      .setDepth(15);
    let glow: Phaser.GameObjects.Image | undefined;
    if (complete) {
      glow = this.add
        .image(x, y, TEX.GLOW)
        .setTint(config.accent)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.1)
        .setDepth(14)
        .setAlpha(0.8);
      this.tweens.add({
        alpha: 0.4,
        duration: 1200,
        repeat: -1,
        targets: glow,
        yoyo: true,
      });
    }
    const zone = this.add
      .zone(x, y, 108, 108)
      .setInteractive({ useHandCursor: unlocked });
    const nodeIndex = this.nodes.length;

    if (!unlocked) {
      this.add
        .text(x, y, 'X', textStyle(18, '#4b4c51', 'monospace', false))
        .setOrigin(0.5)
        .setDepth(16);
    }

    zone.on('pointerover', () => {
      if (unlocked) this.selectNode(nodeIndex);
      else
        this.description.setText(
          `FASE ${String(phaseId)}  ·  BLOQUEADA  ·  conclua a fase ${String(phaseId - 1)}`,
        );
    });
    zone.on('pointerout', () => {
      this.updateDescription();
    });
    zone.on('pointerdown', () => {
      audio.unlock();
      if (!unlocked) return;
      this.selectNode(nodeIndex);
      this.time.delayedCall(340, () => {
        this.startSelectedPhase();
      });
    });

    this.nodes.push({
      avatarX: x,
      avatarY: y - 4,
      complete,
      glow,
      phaseId,
      ring,
      unlocked,
      zone,
    });
  }

  private findClosestUnlocked(index: number) {
    const clamped = Phaser.Math.Clamp(index, 0, this.nodes.length - 1);
    if (this.nodes[clamped].unlocked) return clamped;
    return this.nodes.reduce(
      (last, node, nodeIndex) => (node.unlocked ? nodeIndex : last),
      0,
    );
  }

  private moveSelection(direction: number) {
    const count = this.nodes.length;
    for (let step = 1; step <= count; step++) {
      const next = Phaser.Math.Wrap(
        this.selectedNode + direction * step,
        0,
        count,
      );
      if (this.nodes[next].unlocked) {
        this.selectNode(next);
        return;
      }
    }
  }

  private selectNode(index: number, animate = true) {
    if (this.startingPhase || !this.nodes[index].unlocked) return;
    const previousX = this.avatar.x;
    const changed = index !== this.selectedNode;
    this.selectedNode = index;
    this.registry.set('last-phase-node', index);

    this.nodes.forEach((node, nodeIndex) => {
      const selected = nodeIndex === index;
      const accent = PHASES[node.phaseId].accent;
      node.ring.setStrokeStyle(
        selected ? 5 : node.complete ? 4 : 3,
        selected
          ? 0xffffff
          : node.complete
            ? accent
            : node.unlocked
              ? 0x202024
              : 0x4b4c51,
        selected ? 1 : 0.85,
      );
      node.ring.setScale(selected ? 1.18 : 1);
    });
    this.updateDescription();

    if (!animate || !changed) return;
    audio.sfx('click');
    const target = this.nodes[index];
    this.avatar.setFlipX(target.avatarX < previousX).play(LOBBY_RUN, true);
    this.tweens.killTweensOf(this.avatar);
    this.tweens.add({
      duration: 420,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.avatar.setY(target.avatarY).play(LOBBY_IDLE, true);
      },
      targets: this.avatar,
      x: target.avatarX,
      y: target.avatarY - 8,
    });
  }

  private updateDescription() {
    const node = this.nodes[this.selectedNode];
    const config = PHASES[node.phaseId];
    const score = ProgressApi.get().bestScores[String(node.phaseId)] ?? 0;
    const colorName = peekColorInfo(config.accent, config.colorName).name;
    const status = node.complete
      ? `COR RESTAURADA: ${colorName.toUpperCase()}`
      : 'COR ROUBADA';
    this.description.setText(
      `FASE ${String(node.phaseId)}  ·  ${config.name}  ·  ${status}${score > 0 ? `  ·  ${String(score)} PTS` : ''}`,
    );
  }

  private startSelectedPhase() {
    if (this.startingPhase) return;
    const node = this.nodes[this.selectedNode];
    if (!node.unlocked) return;
    this.startingPhase = true;
    audio.stopMusic(0.4);
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(KEY.SCENE.GAME_PHASE, { phaseId: node.phaseId });
    });
  }
}
