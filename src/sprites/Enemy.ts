import Phaser from 'phaser';

import { GROUND_TOP } from '../constants';
import type { EnemySpec, EnemyType } from '../data/phases';
import { ENEMY_TEX } from '../graphics/textures';

interface EnemyStats {
  health: number;
  /** Pode ser derrotado pisando na cabeca (estilo Mario). */
  stompable: boolean;
  texture: readonly [string, string];
}

const STATS: Record<EnemyType, EnemyStats> = {
  brute: { health: 6, stompable: false, texture: ENEMY_TEX.BRUTE },
  crawler: { health: 2, stompable: true, texture: ENEMY_TEX.CRAWLER },
  flyer: { health: 2, stompable: true, texture: ENEMY_TEX.FLYER },
  hopper: { health: 3, stompable: true, texture: ENEMY_TEX.HOPPER },
  spitter: { health: 3, stompable: false, texture: ENEMY_TEX.SPITTER },
};

type BruteState = 'charge' | 'rest' | 'walk' | 'windup';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly enemyType: EnemyType;
  health: number;
  readonly stompable: boolean;

  private bruteState: BruteState = 'walk';
  private direction = 1;
  private homeX: number;
  private homeY: number;
  private hurtUntil = 0;
  private nextAction = 0;
  private range: number;
  private phaseSpeed: number;
  private spitWindup = 0;

  constructor(scene: Phaser.Scene, spec: EnemySpec, phaseId: number) {
    const stats = STATS[spec.type];
    super(scene, spec.x, spec.y ?? GROUND_TOP, stats.texture[0]);
    scene.add.existing(this);
    scene.physics.world.enable(this);

    this.enemyType = spec.type;
    this.health = stats.health + (phaseId >= 4 ? 1 : 0);
    this.stompable = stats.stompable;
    this.homeX = spec.x;
    this.homeY = spec.y ?? GROUND_TOP;
    this.range = spec.range ?? 100;
    this.phaseSpeed = 1 + phaseId * 0.08;
    this.direction = spec.x % 2 === 0 ? 1 : -1;
    this.nextAction = scene.time.now + 800 + (spec.x % 700);

    this.setDepth(20);
    this.setupBody();
    this.createAnimation(scene, stats.texture);
  }

  private createAnimation(
    scene: Phaser.Scene,
    texture: readonly [string, string],
  ) {
    const key = `ENEMY_${this.enemyType.toUpperCase()}`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        frameRate: this.enemyType === 'flyer' ? 10 : 6,
        frames: texture.map((frame) => ({ key: frame })),
        key,
        repeat: -1,
      });
    }
    // Cuspidor e saltador escolhem o quadro pelo estado; os demais animam sozinhos.
    if (this.enemyType !== 'spitter' && this.enemyType !== 'hopper') {
      this.play(key);
    }
  }

  /**
   * Aplica tamanho/gravidade do corpo. Precisa ser chamado de novo depois de
   * `group.add(enemy)`, porque o grupo restaura os padroes do corpo fisico.
   */
  setupBody() {
    switch (this.enemyType) {
      case 'crawler':
        this.setOrigin(0.5, 1).setSize(54, 36).setOffset(9, 20);
        break;
      case 'hopper':
        this.setOrigin(0.5, 1).setSize(40, 56).setOffset(12, 16);
        break;
      case 'spitter':
        this.setOrigin(0.5, 1).setSize(38, 66).setOffset(13, 22);
        this.body.setImmovable(true).setAllowGravity(false);
        break;
      case 'brute':
        this.setOrigin(0.5, 1).setSize(78, 64).setOffset(17, 30);
        break;
      case 'flyer':
        this.setOrigin(0.5, 0.5).setSize(34, 34).setOffset(27, 17);
        this.body.setAllowGravity(false);
        break;
    }
    this.setCollideWorldBounds(true);
  }

  /** Alvo do olhar/tiro do cuspidor. */
  get spitOrigin() {
    return new Phaser.Math.Vector2(this.x, this.y - 58);
  }

  /** Verdadeiro durante a preparacao do ataque (o cenario mostra aviso). */
  get isTelegraphing() {
    return this.bruteState === 'windup' || this.spitWindup > 0;
  }

  updateAI(
    time: number,
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    spit: (enemy: Enemy) => void,
  ) {
    if (!this.active) {
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    switch (this.enemyType) {
      case 'crawler':
        this.patrol(45 * this.phaseSpeed + 15);
        break;
      case 'hopper':
        this.hop(time, dx);
        break;
      case 'flyer':
        this.fly(time, dx, dy);
        break;
      case 'spitter':
        this.spitAt(time, delta, dx, spit);
        break;
      case 'brute':
        this.bruteAI(time, dx, dy);
        break;
    }
  }

  private patrol(speed: number) {
    if (this.x <= this.homeX - this.range) this.direction = 1;
    else if (this.x >= this.homeX + this.range) this.direction = -1;
    if (this.body.blocked.left) this.direction = 1;
    if (this.body.blocked.right) this.direction = -1;
    this.setFlipX(this.direction < 0);
    if (!this.isHurt(this.scene.time.now)) {
      this.setVelocityX(this.direction * speed);
    }
  }

  private hop(time: number, dx: number) {
    const grounded = this.body.blocked.down;
    this.setTexture(grounded ? this.frameFor(0) : this.frameFor(1));
    if (grounded) {
      this.setVelocityX(this.body.velocity.x * 0.8);
    }
    if (grounded && time >= this.nextAction) {
      const near = Math.abs(dx) < 560;
      this.direction = near ? Math.sign(dx) || 1 : this.direction;
      this.setFlipX(this.direction < 0);
      this.setVelocity(
        near ? this.direction * 170 * this.phaseSpeed : 0,
        near ? -560 : -260,
      );
      this.nextAction = time + 1300 - this.phaseSpeed * 60;
    }
  }

  private frameFor(index: 0 | 1) {
    return STATS[this.enemyType].texture[index];
  }

  private fly(time: number, dx: number, dy: number) {
    const chasing = Math.abs(dx) < 380 && Math.abs(dy) < 300;
    const targetX = chasing
      ? this.x + dx
      : this.homeX + Math.sin(time * 0.0011) * 90;
    const targetY = chasing
      ? Phaser.Math.Clamp(this.y + dy - 40, 200, 470)
      : this.homeY + Math.sin(time * 0.002) * 26;
    const speed = chasing ? 105 * this.phaseSpeed : 60;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    const distance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      targetX,
      targetY,
    );
    const factor = Math.min(1, distance / 40);
    this.setVelocity(
      Math.cos(angle) * speed * factor,
      Math.sin(angle) * speed * factor,
    );
    this.setFlipX(dx < 0 && chasing ? true : this.body.velocity.x < 0);
  }

  private spitAt(
    time: number,
    delta: number,
    dx: number,
    spit: (enemy: Enemy) => void,
  ) {
    this.setFlipX(dx < 0);
    if (this.spitWindup > 0) {
      this.spitWindup -= delta;
      this.setTexture(this.frameFor(1));
      if (this.spitWindup <= 0) {
        spit(this);
        this.setTexture(this.frameFor(0));
        this.nextAction = time + 2300 - this.phaseSpeed * 90;
      }
      return;
    }
    this.setTexture(this.frameFor(0));
    if (time >= this.nextAction && Math.abs(dx) < 640) {
      this.spitWindup = 480;
    }
  }

  private bruteAI(time: number, dx: number, dy: number) {
    switch (this.bruteState) {
      case 'walk':
        this.patrol(38 * this.phaseSpeed);
        if (
          Math.abs(dx) < 360 &&
          Math.abs(dy) < 90 &&
          time >= this.nextAction
        ) {
          this.bruteState = 'windup';
          this.direction = Math.sign(dx) || 1;
          this.setFlipX(this.direction < 0);
          this.setVelocityX(0);
          this.nextAction = time + 620;
          this.setTint(0xff6666).setTintMode(Phaser.TintModes.ADD);
        }
        break;
      case 'windup':
        this.setVelocityX(0);
        if (time >= this.nextAction) {
          this.bruteState = 'charge';
          this.nextAction = time + 720;
          this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        }
        break;
      case 'charge':
        this.setVelocityX(this.direction * 330 * this.phaseSpeed);
        if (
          time >= this.nextAction ||
          this.body.blocked.left ||
          this.body.blocked.right
        ) {
          this.bruteState = 'rest';
          this.nextAction = time + 900;
          this.setVelocityX(0);
        }
        break;
      case 'rest':
        this.setVelocityX(0);
        if (time >= this.nextAction) {
          this.bruteState = 'walk';
          this.nextAction = time + 1500;
        }
        break;
    }
  }

  /** Aplica dano. Devolve true se o inimigo morreu. */
  takeHit(damage: number, fromX: number, time: number): boolean {
    this.health -= damage;
    this.hurtUntil = time + 180;
    if (this.enemyType !== 'brute' && this.enemyType !== 'spitter') {
      this.setVelocity(this.x < fromX ? -140 : 140, -170);
    }
    return this.health <= 0;
  }

  isHurt(time: number) {
    return time < this.hurtUntil;
  }
}
