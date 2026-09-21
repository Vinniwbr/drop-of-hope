import Phaser from 'phaser';

import { BOSS_FRAME, GROUND_TOP } from '../constants';
import type { BossId, EnemyType, PhaseConfig } from '../data/phases';
import type { Effects } from '../graphics/effects';
import { audio } from '../systems/audio';
import type { Player } from './Player';

type PatternName =
  | 'clones'
  | 'dash'
  | 'doubleDash'
  | 'fan'
  | 'fanWide'
  | 'homingBurst'
  | 'crossfire'
  | 'pursuit'
  | 'rain'
  | 'ring'
  | 'ringDense'
  | 'shockwave'
  | 'summon'
  | 'teleportFan'
  | 'thorns'
  | 'thornsWide';

/** Ordem dos ataques de cada chefe, por fase da luta (0, 1 e 2). */
const SCRIPTS: Record<BossId, PatternName[][]> = {
  heart: [
    ['homingBurst', 'fanWide'],
    ['homingBurst', 'ringDense', 'fanWide'],
    ['ringDense', 'homingBurst', 'fanWide', 'homingBurst'],
  ],
  mirror: [
    ['teleportFan', 'clones', 'crossfire'],
    ['teleportFan', 'crossfire', 'clones'],
    ['clones', 'teleportFan', 'crossfire', 'clones'],
  ],
  shadow: [
    ['dash', 'pursuit'],
    ['pursuit', 'doubleDash', 'dash'],
    ['doubleDash', 'pursuit', 'doubleDash'],
  ],
  skull: [
    ['fan', 'rain'],
    ['ring', 'rain', 'fan'],
    ['rain', 'ring', 'fan', 'rain'],
  ],
  thorn: [
    ['thorns', 'shockwave'],
    ['thornsWide', 'shockwave', 'thorns'],
    ['thornsWide', 'shockwave', 'thornsWide'],
  ],
};

export interface BossArena {
  left: number;
  right: number;
}

/** O que o chefe precisa do cenario (mantem o chefe desacoplado da fase). */
export interface BossHost {
  arena: BossArena;
  config: PhaseConfig;
  effects: Effects;
  fireOrb: (
    x: number,
    y: number,
    angle: number,
    speed: number,
    gravity?: number,
  ) => void;
  fireHomingOrb: (
    x: number,
    y: number,
    angle: number,
    speed: number,
    turnRate: number,
    trackMs: number,
  ) => void;
  player: Player;
  scene: Phaser.Scene;
  shake: (ms: number, intensity: number) => void;
  spawnMinion: (type: EnemyType, x: number, y: number) => void;
  spawnTimedSpike: (
    x: number,
    telegraphMs: number,
    activeMs: number,
    height: number,
  ) => void;
  spawnWave: (x: number, direction: number, speed: number) => void;
}

interface BossEvents {
  onDefeated: () => void;
  onHealth: (health: number, max: number) => void;
  onPhase: (phase: number) => void;
}

type Ease = string | ((t: number) => number);

const VISUALS: Record<
  BossId,
  {
    baseY: number;
    bodyHeight: number;
    bodyWidth: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  }
> = {
  heart: {
    baseY: 330,
    bodyHeight: 0.7,
    bodyWidth: 0.62,
    offsetX: 0.19,
    offsetY: 0.15,
    scale: 0.58,
  },
  mirror: {
    baseY: 310,
    bodyHeight: 0.62,
    bodyWidth: 0.72,
    offsetX: 0.14,
    offsetY: 0.19,
    scale: 0.52,
  },
  shadow: {
    baseY: 350,
    bodyHeight: 0.56,
    bodyWidth: 0.6,
    offsetX: 0.2,
    offsetY: 0.22,
    scale: 0.56,
  },
  skull: {
    baseY: 300,
    bodyHeight: 0.56,
    bodyWidth: 0.6,
    offsetX: 0.2,
    offsetY: 0.22,
    scale: 0.5,
  },
  thorn: {
    baseY: 325,
    bodyHeight: 0.72,
    bodyWidth: 0.54,
    offsetX: 0.23,
    offsetY: 0.14,
    scale: 0.54,
  },
};

export class Boss {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  private baseX: number;
  private baseY: number;
  private dead = false;
  private events: BossEvents;
  private health: number;
  private host: BossHost;
  private idleKey: string;
  private attackKey: string;
  private maxHealth: number;
  private phase = 0;
  private running = false;
  private scriptIndex = 0;
  private tint: number;
  private token = 0;
  private transitioning = false;
  private vulnerable = false;

  constructor(host: BossHost, events: BossEvents) {
    this.host = host;
    this.events = events;
    const { config, arena, scene } = host;
    this.maxHealth = config.bossHealth;
    this.health = config.bossHealth;
    this.tint = config.bossTint;
    this.baseX = arena.right - 260;
    const visual = VISUALS[config.bossId];
    this.baseY = visual.baseY;
    this.idleKey = `BOSS_${String(config.id)}_IDLE`;
    this.attackKey = `BOSS_${String(config.id)}_ATTACK`;

    if (!scene.anims.exists(this.idleKey)) {
      scene.anims.create({
        frameRate: 5 + Math.floor(config.id / 2),
        frames: scene.anims.generateFrameNumbers(config.bossTexture, {
          end: 3,
          start: 0,
        }),
        key: this.idleKey,
        repeat: -1,
      });
      scene.anims.create({
        frameRate: 9,
        frames: scene.anims.generateFrameNumbers(config.bossTexture, {
          end: 7,
          start: 4,
        }),
        key: this.attackKey,
      });
    }

    this.sprite = scene.physics.add
      .sprite(this.baseX, this.baseY - 260, config.bossTexture, 0)
      .setScale(visual.scale)
      .setTint(this.tint)
      .setDepth(24)
      .setAlpha(0)
      .setImmovable(true);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body
      .setAllowGravity(false)
      .setSize(BOSS_FRAME * visual.bodyWidth, BOSS_FRAME * visual.bodyHeight);
    body.setOffset(BOSS_FRAME * visual.offsetX, BOSS_FRAME * visual.offsetY);
    this.sprite.anims.play(this.idleKey);
    this.sprite.setData('boss', true);
  }

  get isAlive() {
    return !this.dead;
  }

  /** Perigoso ao toque quando esta em combate. */
  get isDangerous() {
    return this.running && !this.dead && !this.transitioning;
  }

  get isVulnerable() {
    return this.vulnerable && !this.dead && !this.transitioning;
  }

  get healthRatio() {
    return this.health / this.maxHealth;
  }

  /** Entrada dramatica: o chefe desce, a arena treme e a luta comeca. */
  begin() {
    const { scene, effects } = this.host;
    this.sprite.setAlpha(0);
    scene.tweens.add({
      alpha: 1,
      duration: 900,
      targets: this.sprite,
    });
    scene.tweens.add({
      duration: 1100,
      ease: 'Bounce.Out',
      onComplete: () => {
        effects.ring(
          this.sprite.x,
          this.sprite.y,
          this.host.config.accent,
          5,
          800,
        );
        this.host.shake(320, 0.012);
        audio.sfx('gate');
        this.vulnerable = true;
        this.running = true;
        void this.loop();
      },
      targets: this.sprite,
      y: this.baseY,
    });
  }

  /** Reinicia a luta do zero (o jogador morreu e voltou para a arena). */
  reset() {
    this.token += 1;
    this.dead = false;
    this.health = this.maxHealth;
    this.phase = 0;
    this.scriptIndex = 0;
    this.running = false;
    this.transitioning = false;
    this.vulnerable = false;
    this.host.scene.tweens.killTweensOf(this.sprite);
    this.sprite
      .setPosition(this.baseX, this.baseY - 260)
      .setAlpha(0)
      .setAngle(0)
      .clearTint()
      .setTint(this.tint);
    this.events.onHealth(this.health, this.maxHealth);
  }

  /** Para tudo sem derrota (jogador morreu ou saiu). */
  halt() {
    this.token += 1;
    this.running = false;
    this.vulnerable = false;
  }

  hit(damage: number): boolean {
    if (!this.isVulnerable) {
      return false;
    }
    this.health = Math.max(0, this.health - damage);
    this.events.onHealth(this.health, this.maxHealth);
    const { effects, scene } = this.host;
    effects.flash(this.sprite, 70);
    effects.ink(this.sprite.x, this.sprite.y, 5);
    audio.sfx('boss-hit');
    scene.tweens.add({
      duration: 50,
      targets: this.sprite,
      x: this.sprite.x + (this.host.player.x < this.sprite.x ? 8 : -8),
      yoyo: true,
    });

    if (this.health <= 0) {
      this.die();
      return true;
    }
    const ratio = this.health / this.maxHealth;
    const nextPhase = ratio <= 0.34 ? 2 : ratio <= 0.67 ? 1 : 0;
    if (nextPhase > this.phase) {
      void this.enterPhase(nextPhase);
    }
    return true;
  }

  update(time: number) {
    if (!this.running || this.dead) {
      return;
    }
    // As artes dos chefes olham para a direita por padrao.
    this.sprite.setFlipX(this.host.player.x < this.sprite.x);
    if (!this.sprite.getData('attacking') && !this.transitioning) {
      this.sprite.y =
        this.sprite.y +
        (this.baseY + Math.sin(time * 0.0022) * 12 - this.sprite.y) * 0.08;
    }
  }

  // ---------------------------------------------------------------- controle

  private alive(token: number) {
    return token === this.token && !this.dead;
  }

  private wait(ms: number): Promise<boolean> {
    const token = this.token;
    return new Promise((resolve) => {
      this.host.scene.time.delayedCall(ms, () => {
        resolve(this.alive(token));
      });
    });
  }

  private move(
    props: { x?: number; y?: number },
    duration: number,
    ease: Ease = 'Sine.InOut',
  ): Promise<boolean> {
    const token = this.token;
    return new Promise((resolve) => {
      this.host.scene.tweens.add({
        duration,
        ease,
        onComplete: () => {
          resolve(this.alive(token));
        },
        targets: this.sprite,
        ...props,
      });
    });
  }

  private get speedFactor() {
    return [1, 0.82, 0.66][this.phase];
  }

  private async loop() {
    const token = this.token;
    await this.wait(700);
    while (this.alive(token) && this.running) {
      const script = SCRIPTS[this.host.config.bossId][this.phase];
      const name = script[this.scriptIndex % script.length];
      this.scriptIndex += 1;
      this.sprite.setData('attacking', true);
      const ok = await this.run(name);
      this.sprite.setData('attacking', false);
      if (!ok || !this.alive(token)) {
        return;
      }
      this.sprite.anims.play(this.idleKey, true);
      // Janela de recuperacao: momento de contra-atacar.
      if (!(await this.wait(1150 * this.speedFactor))) {
        return;
      }
    }
  }

  private async telegraph(ms: number, color = this.host.config.accent) {
    const { scene, effects } = this.host;
    this.sprite.anims.play(this.attackKey, true);
    audio.sfx('boss-charge');
    const warning = scene.add
      .circle(this.sprite.x, this.sprite.y, 40, color, 0.08)
      .setStrokeStyle(4, color, 0.95)
      .setDepth(23);
    scene.tweens.add({
      alpha: 0.9,
      duration: ms,
      ease: 'Quad.In',
      scale: 2.6,
      targets: warning,
    });
    effects.glow(this.sprite.x, this.sprite.y, color, 2.4, ms);
    const ok = await this.wait(ms);
    warning.destroy();
    return ok;
  }

  private run(name: PatternName): Promise<boolean> {
    switch (name) {
      case 'fan':
        return this.patternFan(3, 0.2);
      case 'fanWide':
        return this.patternFan(5, 0.22);
      case 'homingBurst':
        return this.patternHomingBurst();
      case 'crossfire':
        return this.patternCrossfire();
      case 'pursuit':
        return this.patternPursuit();
      case 'ring':
        return this.patternRing(10);
      case 'ringDense':
        return this.patternRing(16);
      case 'dash':
        return this.patternDash(1);
      case 'doubleDash':
        return this.patternDash(2);
      case 'shockwave':
        return this.patternShockwave();
      case 'thorns':
        return this.patternThorns(3);
      case 'thornsWide':
        return this.patternThorns(5);
      case 'rain':
        return this.patternRain(5 + this.phase * 2);
      case 'teleportFan':
        return this.patternTeleportFan();
      case 'clones':
        return this.patternClones();
      case 'summon':
        return this.patternSummon();
    }
  }

  // ---------------------------------------------------------------- padroes

  private predictedTarget(leadMs = 0) {
    const body = this.host.player.body;
    const lead = leadMs / 1000;
    return {
      x: Phaser.Math.Clamp(
        this.host.player.x + body.velocity.x * lead,
        this.host.arena.left + 36,
        this.host.arena.right - 36,
      ),
      y: Phaser.Math.Clamp(
        this.host.player.y - 28 + body.velocity.y * lead * 0.35,
        100,
        GROUND_TOP - 24,
      ),
    };
  }

  private aimAngle(leadMs = 0) {
    const target = this.predictedTarget(leadMs);
    return Phaser.Math.Angle.Between(
      this.sprite.x,
      this.sprite.y,
      target.x,
      target.y,
    );
  }

  private async patternFan(count: number, spread: number) {
    if (!(await this.telegraph(520 * this.speedFactor))) return false;
    const rounds = this.phase === 0 ? 1 : 2;
    for (let round = 0; round < rounds; round++) {
      const base = this.aimAngle(140 + this.phase * 100);
      for (let index = 0; index < count; index++) {
        const angle = base + (index - (count - 1) / 2) * spread;
        this.host.fireOrb(
          this.sprite.x,
          this.sprite.y + 10,
          angle,
          300 + this.phase * 30,
        );
      }
      this.host.shake(90, 0.004);
      if (!(await this.wait(320))) return false;
    }
    return this.wait(300);
  }

  private async patternHomingBurst() {
    if (!(await this.telegraph(520 * this.speedFactor, 0xffffff))) return false;
    const shots = 3 + this.phase;
    for (let index = 0; index < shots; index++) {
      const side = index % 2 === 0 ? -0.12 : 0.12;
      this.host.fireHomingOrb(
        this.sprite.x,
        this.sprite.y,
        this.aimAngle(260) + side,
        235 + this.phase * 18,
        1.65 + this.phase * 0.28,
        1250 + this.phase * 180,
      );
      this.host.effects.spark(
        this.sprite.x,
        this.sprite.y,
        this.host.config.accent,
        7,
        100,
      );
      if (!(await this.wait(260 * this.speedFactor))) return false;
    }
    return this.wait(420);
  }

  private async patternCrossfire() {
    const { arena, scene, config } = this.host;
    const target = this.predictedTarget(360);
    const origins = [
      { x: arena.left + 38, y: Phaser.Math.Clamp(target.y - 100, 140, 390) },
      { x: arena.right - 38, y: Phaser.Math.Clamp(target.y + 80, 190, 440) },
      { x: target.x, y: 70 },
    ];
    const warnings = origins.map((origin) =>
      scene.add
        .circle(origin.x, origin.y, 18, config.accent, 0.16)
        .setStrokeStyle(3, config.accent, 0.9)
        .setDepth(24),
    );
    for (const warning of warnings) {
      scene.tweens.add({
        alpha: 0.8,
        duration: 380 * this.speedFactor,
        scale: 1.8,
        targets: warning,
      });
    }
    if (!(await this.telegraph(560 * this.speedFactor))) {
      for (const warning of warnings) warning.destroy();
      return false;
    }
    for (const [index, origin] of origins.entries()) {
      warnings[index].destroy();
      const refreshed = this.predictedTarget(220 + index * 80);
      const angle = Phaser.Math.Angle.Between(
        origin.x,
        origin.y,
        refreshed.x,
        refreshed.y,
      );
      this.host.fireHomingOrb(
        origin.x,
        origin.y,
        angle,
        260 + this.phase * 22,
        1.25 + this.phase * 0.2,
        900 + this.phase * 160,
      );
    }
    this.host.shake(140, 0.007);
    return this.wait(760);
  }

  private async patternPursuit() {
    const { arena } = this.host;
    const passes = this.phase === 2 ? 3 : 2;
    for (let pass = 0; pass < passes; pass++) {
      if (!(await this.fade(0.12, 160))) return false;
      const target = this.predictedTarget(320);
      this.sprite.setPosition(
        Phaser.Math.Clamp(target.x, arena.left + 100, arena.right - 100),
        Phaser.Math.Clamp(target.y - 190, 130, 270),
      );
      this.host.effects.ring(
        target.x,
        target.y,
        this.host.config.accent,
        2,
        380,
      );
      if (!(await this.fade(1, 180))) return false;
      if (!(await this.telegraph(260 * this.speedFactor))) return false;
      const aim = this.aimAngle(180);
      for (const offset of [-0.18, 0, 0.18]) {
        this.host.fireOrb(
          this.sprite.x,
          this.sprite.y + 12,
          aim + offset,
          330 + this.phase * 25,
        );
      }
      if (!(await this.wait(330 * this.speedFactor))) return false;
    }
    return this.move({ x: this.baseX, y: this.baseY }, 620);
  }

  private async patternRing(count: number) {
    if (!(await this.telegraph(620 * this.speedFactor))) return false;
    const offset = Math.random() * Math.PI;
    for (let index = 0; index < count; index++) {
      this.host.fireOrb(
        this.sprite.x,
        this.sprite.y,
        offset + (index / count) * Math.PI * 2,
        230 + this.phase * 25,
      );
    }
    this.host.effects.ring(
      this.sprite.x,
      this.sprite.y,
      this.host.config.accent,
      4,
      600,
    );
    this.host.shake(150, 0.008);
    if (this.phase > 0 && (await this.wait(520))) {
      for (let index = 0; index < count; index++) {
        this.host.fireOrb(
          this.sprite.x,
          this.sprite.y,
          offset + ((index + 0.5) / count) * Math.PI * 2,
          210 + this.phase * 25,
        );
      }
    }
    return this.wait(500);
  }

  private async patternDash(times: number) {
    const { scene, arena, player } = this.host;
    for (let round = 0; round < times; round++) {
      // Faixa de aviso na altura do jogador.
      const laneY = Phaser.Math.Clamp(player.y - 30, 280, 480);
      const lane = scene.add
        .rectangle(
          (arena.left + arena.right) / 2,
          laneY,
          arena.right - arena.left,
          56,
          this.host.config.accent,
          0.1,
        )
        .setStrokeStyle(2, this.host.config.accent, 0.7)
        .setDepth(18);
      scene.tweens.add({
        alpha: 0.35,
        duration: 200,
        targets: lane,
        yoyo: true,
        repeat: 1,
      });
      const ok = await this.telegraph(560 * this.speedFactor);
      lane.destroy();
      if (!ok) return false;

      const direction = player.x < this.sprite.x ? -1 : 1;
      const targetX = Phaser.Math.Clamp(
        this.sprite.x + direction * (arena.right - arena.left - 140),
        arena.left + 60,
        arena.right - 60,
      );
      this.host.shake(120, 0.006);
      if (
        !(await this.move(
          { x: targetX, y: laneY },
          480 * this.speedFactor,
          'Quad.In',
        ))
      )
        return false;
      this.host.effects.ring(
        this.sprite.x,
        this.sprite.y,
        this.host.config.accent,
        3,
        400,
      );
      if (!(await this.wait(180))) return false;
      if (
        !(await this.move(
          { x: this.baseX, y: this.baseY },
          720 * this.speedFactor,
          'Sine.InOut',
        ))
      )
        return false;
    }
    return true;
  }

  private async patternShockwave() {
    if (!(await this.telegraph(480 * this.speedFactor))) return false;
    if (!(await this.move({ y: this.baseY - 90 }, 280, 'Quad.Out')))
      return false;
    if (
      !(await this.move(
        { x: this.predictedTarget(300).x, y: GROUND_TOP - 120 },
        300,
        'Quad.In',
      ))
    )
      return false;
    this.host.shake(260, 0.018);
    audio.sfx('gate');
    this.host.effects.dust(this.sprite.x, GROUND_TOP - 4, 14);
    this.host.effects.ring(
      this.sprite.x,
      GROUND_TOP - 8,
      this.host.config.accent,
      4,
      500,
    );
    const speed = 250 + this.phase * 45;
    this.host.spawnWave(this.sprite.x, -1, speed);
    this.host.spawnWave(this.sprite.x, 1, speed);
    if (!(await this.wait(650))) return false;
    return this.move({ x: this.baseX, y: this.baseY }, 800);
  }

  private async patternThorns(count: number) {
    const { arena } = this.host;
    if (!(await this.telegraph(420 * this.speedFactor))) return false;
    const spread = 118;
    const targetX = this.predictedTarget(360).x;
    for (let index = 0; index < count; index++) {
      const x = Phaser.Math.Clamp(
        targetX +
          (index - (count - 1) / 2) * spread +
          Phaser.Math.Between(-24, 24),
        arena.left + 40,
        arena.right - 40,
      );
      this.host.spawnTimedSpike(x, 700 * this.speedFactor, 520, 150);
    }
    this.host.shake(120, 0.005);
    return this.wait(1500 * this.speedFactor);
  }

  private async patternRain(count: number) {
    const { arena, effects, config } = this.host;
    if (!(await this.telegraph(380 * this.speedFactor))) return false;
    for (let index = 0; index < count; index++) {
      const target = this.predictedTarget(260 + index * 40);
      const x =
        index % 3 === 0
          ? Phaser.Math.Clamp(
              target.x + Phaser.Math.Between(-35, 35),
              arena.left + 40,
              arena.right - 40,
            )
          : Phaser.Math.Between(arena.left + 40, arena.right - 40);
      effects.ring(x, GROUND_TOP - 6, config.accent, 1.2, 620, 12);
      this.host.scene.time.delayedCall(560, () => {
        if (this.alive(this.token)) {
          this.host.fireOrb(x, 30, Math.PI / 2, 340 + this.phase * 30);
        }
      });
      if (!(await this.wait(230 * this.speedFactor))) return false;
    }
    return this.wait(700);
  }

  private async patternTeleportFan() {
    const { arena, effects } = this.host;
    if (!(await this.fade(0.1, 240))) return false;
    const x = Phaser.Math.Clamp(
      this.host.player.x +
        (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(260, 420),
      arena.left + 80,
      arena.right - 80,
    );
    this.sprite.setPosition(x, Phaser.Math.Between(240, 340));
    effects.ring(x, this.sprite.y, this.host.config.accent, 3, 500);
    if (!(await this.fade(1, 240))) return false;
    const ok = await this.patternFan(5, 0.2);
    if (!ok) return false;
    return this.move({ x: this.baseX, y: this.baseY }, 800);
  }

  private fade(alpha: number, duration: number): Promise<boolean> {
    const token = this.token;
    return new Promise((resolve) => {
      this.host.scene.tweens.add({
        alpha,
        duration,
        onComplete: () => {
          resolve(this.alive(token));
        },
        targets: this.sprite,
      });
    });
  }

  private async patternClones() {
    const { scene, arena, effects, config } = this.host;
    if (!(await this.telegraph(420 * this.speedFactor))) return false;
    const slots = [
      arena.left + 160,
      (arena.left + arena.right) / 2,
      arena.right - 160,
    ];
    const clones = slots.map((x, index) => {
      const clone = scene.add
        .image(
          x,
          this.baseY + (index % 2) * 40 - 20,
          this.sprite.texture.key,
          this.sprite.frame.name,
        )
        .setScale(this.sprite.scaleX)
        .setTint(config.accent)
        .setAlpha(0)
        .setDepth(23);
      scene.tweens.add({ alpha: 0.65, duration: 250, targets: clone });
      effects.ring(clone.x, clone.y, config.accent, 2, 450);
      return clone;
    });
    if (!(await this.wait(700 * this.speedFactor))) {
      for (const clone of clones) clone.destroy();
      return false;
    }
    for (const clone of clones) {
      const angle = Phaser.Math.Angle.Between(
        clone.x,
        clone.y,
        this.host.player.x,
        this.host.player.y - 28,
      );
      for (const offset of [-0.14, 0, 0.14]) {
        this.host.fireOrb(
          clone.x,
          clone.y,
          angle + offset,
          290 + this.phase * 30,
        );
      }
      effects.flash(clone, 80);
      scene.tweens.add({
        alpha: 0,
        duration: 320,
        onComplete: () => {
          clone.destroy();
        },
        targets: clone,
      });
    }
    return this.wait(900);
  }

  private async patternSummon() {
    const { arena } = this.host;
    if (!(await this.telegraph(500 * this.speedFactor))) return false;
    const count = this.phase === 2 ? 3 : 2;
    for (let index = 0; index < count; index++) {
      const x = Phaser.Math.Between(arena.left + 100, arena.right - 100);
      this.host.effects.spark(x, 260, this.host.config.accent, 14, 140);
      this.host.spawnMinion('flyer', x, 260);
    }
    return this.wait(900);
  }

  // ---------------------------------------------------------- fases da luta

  private async enterPhase(phase: number) {
    this.phase = phase;
    this.scriptIndex = 0;
    this.transitioning = true;
    this.token += 1;
    const token = this.token;
    const { scene, effects, config } = this.host;
    this.events.onPhase(phase);
    scene.tweens.killTweensOf(this.sprite);
    this.sprite.setData('attacking', true);
    audio.sfx('boss-charge');
    this.host.shake(500, 0.016);
    effects.ring(this.sprite.x, this.sprite.y, 0xffffff, 6, 900);
    effects.spark(this.sprite.x, this.sprite.y, config.accent, 26, 320);
    await this.move({ x: this.baseX, y: this.baseY }, 500);
    await this.wait(900);
    if (this.dead || token !== this.token) return;
    this.transitioning = false;
    this.sprite.setData('attacking', false);
    void this.loop();
  }

  private die() {
    this.dead = true;
    this.running = false;
    this.vulnerable = false;
    this.token += 1;
    const { scene, effects, config } = this.host;
    scene.tweens.killTweensOf(this.sprite);
    (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    this.sprite.anims.stop();
    audio.sfx('boss-defeat');
    this.events.onDefeated();

    const shake = scene.tweens.add({
      duration: 60,
      repeat: -1,
      targets: this.sprite,
      x: this.sprite.x + 7,
      yoyo: true,
    });
    for (let index = 0; index < 10; index++) {
      scene.time.delayedCall(index * 120, () => {
        effects.ink(
          this.sprite.x + Phaser.Math.Between(-60, 60),
          this.sprite.y + Phaser.Math.Between(-60, 60),
          6,
        );
        effects.spark(this.sprite.x, this.sprite.y, config.accent, 8, 220);
        effects.flash(this.sprite, 60);
      });
    }
    scene.tweens.add({
      alpha: 0,
      delay: 1000,
      duration: 900,
      onComplete: () => {
        shake.stop();
        effects.ring(this.sprite.x, this.sprite.y, 0xffffff, 9, 1100);
        this.sprite.setVisible(false);
      },
      scale: this.sprite.scale * 0.6,
      targets: this.sprite,
    });
  }
}
