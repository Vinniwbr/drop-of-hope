import Phaser from 'phaser';

import { HOPE, KEY } from '../constants';
import type { GameInput } from '../systems/input';

const ANIM = {
  ATTACK: 'HOPE_ATTACK',
  CROUCH_DOWN: 'HOPE_CROUCH_DOWN',
  CROUCH_UP: 'HOPE_CROUCH_UP',
  IDLE: 'HOPE_IDLE',
  RUN: 'HOPE_RUN',
  SHOOT: 'HOPE_SHOOT',
} as const;

const MOVE = {
  AIR_ACCEL: 1900,
  AIR_DECEL: 900,
  COYOTE: 100,
  DASH_COOLDOWN: 380,
  DASH_MS: 170,
  DASH_SPEED: 640,
  FAST_FALL_GRAVITY: 750,
  GROUND_ACCEL: 3000,
  GROUND_DECEL: 3600,
  HANG_GRAVITY: -620,
  ICE_ACCEL: 700,
  ICE_DECEL: 260,
  JUMP_BUFFER: 120,
  JUMP_SPEED: 640,
  MAX_FALL: 900,
  MAX_RUN: 300,
  WALL_JUMP_X: 380,
  WALL_JUMP_Y: 580,
  WALL_SLIDE: 140,
} as const;

/** Momentos (ms desde o inicio do golpe) em que a area de dano e verificada. */
const ATTACK_HIT_TIMES = [115, 190] as const;
const ATTACK_MS = 320;
const SHOOT_MS = 340;
const SHOOT_FIRE_AT = 105;
const NOVA_MS = 460;

export interface MeleeBox {
  box: Phaser.Geom.Rectangle;
  stage: number;
  swing: number;
}

export type PlayerSignal =
  'attack' | 'dash' | 'jump' | 'land' | 'nova' | 'shoot' | 'step' | 'wall-jump';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly signals = new Phaser.Events.EventEmitter();
  /** Incrementa a cada golpe de pincel; o cenario usa para nao acertar duas vezes. */
  swingId = 0;

  private airDashAvailable = true;
  private attackClock = 0;
  private attackCooldown = 0;
  private attackHits = 0;
  private baseScale: number = HOPE.SCALE;
  private crouching = false;
  private coyote = 0;
  private dashCooldown = 0;
  private dashDirection = 1;
  private dashTimer = 0;
  private ghostTimer = 0;
  private frozen = false;
  private hurtTimer = 0;
  private iceSurface = false;
  private jumpBuffer = 0;
  private novaTimer = 0;
  private postureReady = false;
  private shootClock = 0;
  private shootCooldown = 0;
  private shotFired = true;
  private squashX = 1;
  private squashY = 1;
  private stepTimer = 0;
  private wasGrounded = true;
  private lastFallSpeed = 0;
  private facing = 1;

  private readonly gameInput: GameInput;

  constructor(scene: Phaser.Scene, x: number, y: number, gameInput: GameInput) {
    super(scene, x, y, KEY.SPRITESHEET.PLAYER_IDLE, 0);
    this.gameInput = gameInput;
    Player.createAnimations(scene);
    scene.add.existing(this);
    scene.physics.world.enable(this);

    this.setOrigin(
      HOPE.ANCHOR_X / HOPE.FRAME_WIDTH,
      HOPE.ANCHOR_Y / HOPE.FRAME_HEIGHT,
    )
      .setScale(this.baseScale)
      .setCollideWorldBounds(true)
      .setMaxVelocity(MOVE.DASH_SPEED, MOVE.MAX_FALL);
    this.setBodyPosture(false);
    this.play(ANIM.IDLE);
  }

  static createAnimations(scene: Phaser.Scene) {
    const anims = scene.anims;
    const frames = (key: string, list: number[]) =>
      list.map((frame) => ({ frame, key }));

    if (!anims.exists(ANIM.IDLE)) {
      anims.create({
        frameRate: 7,
        frames: anims.generateFrameNumbers(KEY.SPRITESHEET.PLAYER_IDLE, {
          end: 7,
          start: 0,
        }),
        key: ANIM.IDLE,
        repeat: -1,
      });
      anims.create({
        frameRate: 17,
        frames: frames(
          KEY.SPRITESHEET.PLAYER_RUN,
          [1, 2, 3, 4, 9, 8, 7, 6, 5, 4, 3, 2],
        ),
        key: ANIM.RUN,
        repeat: -1,
      });
      anims.create({
        frameRate: 14,
        frames: frames(KEY.SPRITESHEET.PLAYER_CROUCH, [1, 2, 3]),
        key: ANIM.CROUCH_DOWN,
      });
      anims.create({
        frameRate: 14,
        frames: frames(KEY.SPRITESHEET.PLAYER_CROUCH, [4, 5]),
        key: ANIM.CROUCH_UP,
      });
      anims.create({
        frameRate: 16,
        frames: frames(KEY.SPRITESHEET.PLAYER_ATTACK, [1, 2, 3, 4, 5]),
        key: ANIM.ATTACK,
      });
      anims.create({
        frameRate: 14,
        frames: frames(KEY.SPRITESHEET.PLAYER_ATTACK, [7, 8, 9, 10]),
        key: ANIM.SHOOT,
      });
    }
  }

  get facingDirection() {
    return this.facing;
  }

  get isCrouching() {
    return this.crouching;
  }

  get isGrounded() {
    return this.body.blocked.down || this.body.touching.down;
  }

  isDashing() {
    return this.dashTimer > 0;
  }

  isHurt() {
    return this.hurtTimer > 0;
  }

  setIce(onIce: boolean) {
    this.iceSurface = onIce;
  }

  freeze() {
    this.frozen = true;
    this.body.setVelocity(0, 0).setAcceleration(0, 0);
    this.body.moves = false;
  }

  unfreeze() {
    this.frozen = false;
    this.body.moves = true;
    this.hurtTimer = 0;
    this.dashTimer = 0;
    this.attackClock = 0;
    this.shootClock = 0;
    this.novaTimer = 0;
  }

  /** Empurra o personagem para longe de `sourceX` e trava o controle por instantes. */
  knockback(sourceX: number) {
    this.hurtTimer = 340;
    this.dashTimer = 0;
    this.attackClock = 0;
    this.shootClock = 0;
    const direction = this.x < sourceX ? -1 : 1;
    this.body.setVelocity(direction * 270, -320);
    this.setSquash(1.2, 0.85);
  }

  /** Quique apos pisar em um inimigo. */
  bounce(strength = 480) {
    this.body.setVelocityY(-strength);
    this.airDashAvailable = true;
    this.setSquash(0.86, 1.2);
  }

  /** Posicao/tamanho do golpe de pincel para o estagio informado (0 baixo, 1 alto). */
  meleeBox(stage: number): Phaser.Geom.Rectangle {
    const reach = stage === 0 ? 96 : 112;
    const height = stage === 0 ? 64 : 92;
    const top = this.y - (stage === 0 ? 68 : 96);
    const left = this.facing > 0 ? this.x - 6 : this.x - reach + 6;
    return new Phaser.Geom.Rectangle(left, top, reach, height);
  }

  update(delta: number) {
    if (this.frozen) {
      return;
    }
    const input = this.gameInput.state;
    this.tickTimers(delta);

    const grounded = this.isGrounded;
    const wallSide = this.body.blocked.left
      ? -1
      : this.body.blocked.right
        ? 1
        : 0;
    const stunned = this.hurtTimer > 0;
    const moveX = stunned ? 0 : input.moveX;
    const acting = this.attackClock > 0 || this.shootClock > 0;
    const busy = acting || this.novaTimer > 0;
    const wantsCrouch = grounded && input.held.crouch && !stunned && !busy;
    this.setBodyPosture(wantsCrouch);

    if (grounded) {
      this.coyote = MOVE.COYOTE;
      this.airDashAvailable = true;
    }
    if (input.pressed.jump && !stunned) {
      this.jumpBuffer = MOVE.JUMP_BUFFER;
    }

    if (
      !stunned &&
      !wantsCrouch &&
      input.pressed.dash &&
      this.dashCooldown <= 0 &&
      this.airDashAvailable
    ) {
      this.startDash(moveX, grounded);
    }
    if (this.dashTimer > 0) {
      this.updateDash(delta);
      return;
    }

    const pressingIntoWall = wallSide !== 0 && moveX === wallSide && !grounded;
    if (this.jumpBuffer > 0 && wallSide !== 0 && !grounded && !this.coyote) {
      this.jumpBuffer = 0;
      this.airDashAvailable = true;
      this.facing = -wallSide;
      this.body.setVelocity(-wallSide * MOVE.WALL_JUMP_X, -MOVE.WALL_JUMP_Y);
      this.setSquash(0.85, 1.18);
      this.signals.emit('wall-jump');
    } else if (this.jumpBuffer > 0 && this.coyote > 0 && !wantsCrouch) {
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.body.setVelocityY(-MOVE.JUMP_SPEED);
      this.setSquash(0.82, 1.22);
      this.signals.emit('jump');
    }

    if (input.released.jump && this.body.velocity.y < -240) {
      this.body.setVelocityY(this.body.velocity.y * 0.42);
    }
    if (pressingIntoWall && this.body.velocity.y > MOVE.WALL_SLIDE) {
      this.body.setVelocityY(MOVE.WALL_SLIDE);
    }

    // Gravidade variavel: flutua no topo do pulo e cai mais rapido na descida.
    const vy = this.body.velocity.y;
    if (!grounded && input.held.jump && Math.abs(vy) < 110) {
      this.body.setGravityY(MOVE.HANG_GRAVITY);
    } else if (!grounded && vy > 0) {
      this.body.setGravityY(MOVE.FAST_FALL_GRAVITY);
    } else {
      this.body.setGravityY(0);
    }

    if (!stunned && !wantsCrouch) {
      if (input.pressed.nova && this.novaTimer <= 0) {
        this.trySignalNova();
      }
      if (
        input.pressed.attack &&
        this.attackCooldown <= 0 &&
        this.novaTimer <= 0
      ) {
        this.startAttack();
      }
      if (
        input.pressed.shoot &&
        this.shootCooldown <= 0 &&
        this.novaTimer <= 0
      ) {
        this.startShot();
      }
    }
    this.processActionTimeline();

    this.updateHorizontal(delta, moveX, grounded, wantsCrouch, acting);
    this.updateFacing(moveX, acting);
    this.updateFeedback(delta, grounded, wantsCrouch);
    this.updateAnimation(grounded, pressingIntoWall, wantsCrouch, stunned);
  }

  /** Solicita a explosao; o cenario confirma consumindo a barra de tinta. */
  private trySignalNova() {
    this.signals.emit('nova-request', (accepted: boolean) => {
      if (accepted) {
        this.novaTimer = NOVA_MS;
        this.attackClock = 0;
        this.shootClock = 0;
        this.body.setVelocity(0, Math.min(0, this.body.velocity.y));
        this.setSquash(1.2, 0.85);
      }
    });
  }

  private setSquash(x: number, y: number) {
    this.squashX = x;
    this.squashY = y;
  }

  private setBodyPosture(crouching: boolean) {
    if (this.postureReady && crouching === this.crouching) {
      return;
    }
    this.postureReady = true;
    this.crouching = crouching;
    const height = crouching ? 66 : 118;
    const width = crouching ? 48 : 40;
    this.setSize(width, height).setOffset(
      HOPE.ANCHOR_X - width / 2,
      HOPE.ANCHOR_Y - height,
    );
  }

  private tickTimers(delta: number) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.coyote = Math.max(0, this.coyote - delta);
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.dashTimer = Math.max(0, this.dashTimer - delta);
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - delta);
    this.novaTimer = Math.max(0, this.novaTimer - delta);
    this.shootCooldown = Math.max(0, this.shootCooldown - delta);
    if (this.attackClock > 0) {
      this.attackClock = Math.min(ATTACK_MS, this.attackClock + delta);
      if (this.attackClock >= ATTACK_MS) this.attackClock = 0;
    }
    if (this.shootClock > 0) {
      this.shootClock += delta;
      if (this.shootClock >= SHOOT_MS) this.shootClock = 0;
    }
  }

  private startAttack() {
    this.attackCooldown = 360;
    this.attackClock = 1;
    this.attackHits = 0;
    this.swingId += 1;
    this.shootClock = 0;
    this.signals.emit('attack');
    this.setSquash(1.1, 0.94);
  }

  private startShot() {
    this.shootCooldown = 460;
    this.shootClock = 1;
    this.shotFired = false;
    this.attackClock = 0;
    this.signals.emit('shoot-start');
  }

  private processActionTimeline() {
    if (this.attackClock > 0 && this.attackHits < ATTACK_HIT_TIMES.length) {
      if (this.attackClock >= ATTACK_HIT_TIMES[this.attackHits]) {
        this.signals.emit('melee', {
          box: this.meleeBox(this.attackHits),
          stage: this.attackHits,
          swing: this.swingId,
        } satisfies MeleeBox);
        this.attackHits += 1;
      }
    }
    if (this.shootClock >= SHOOT_FIRE_AT && !this.shotFired) {
      this.shotFired = true;
      this.signals.emit(
        'shoot',
        new Phaser.Math.Vector2(this.x + this.facing * 44, this.y - 34),
        this.facing,
      );
    }
  }

  private startDash(moveX: number, grounded: boolean) {
    this.dashDirection = moveX || this.facing;
    this.facing = this.dashDirection;
    this.dashTimer = MOVE.DASH_MS;
    this.dashCooldown = MOVE.DASH_COOLDOWN;
    this.ghostTimer = 0;
    this.attackClock = 0;
    this.shootClock = 0;
    if (!grounded) {
      this.airDashAvailable = false;
    }
    this.setSquash(1.3, 0.8);
    this.signals.emit('dash');
  }

  private updateDash(delta: number) {
    this.body.setGravityY(-this.scene.physics.world.gravity.y);
    this.body.setVelocity(this.dashDirection * MOVE.DASH_SPEED, 0);
    this.setFlipX(this.dashDirection < 0);
    this.anims.stop();
    this.setTexture(KEY.SPRITESHEET.PLAYER_RUN, 4);
    this.rotation = this.dashDirection * 0.12;
    this.ghostTimer -= delta;
    if (this.ghostTimer <= 0) {
      this.ghostTimer = 32;
      this.spawnGhost();
    }
    this.applySquash(delta);
  }

  private spawnGhost() {
    const ghost = this.scene.add
      .image(this.x, this.y, this.texture.key, this.frame.name)
      .setOrigin(this.originX, this.originY)
      .setScale(this.scaleX, this.scaleY)
      .setFlipX(this.flipX)
      .setRotation(this.rotation)
      .setTint(0x8fd8ff)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.5)
      .setDepth(this.depth - 1);
    this.scene.tweens.add({
      alpha: 0,
      duration: 260,
      onComplete: () => {
        ghost.destroy();
      },
      targets: ghost,
    });
  }

  private updateHorizontal(
    delta: number,
    moveX: number,
    grounded: boolean,
    crouching: boolean,
    acting: boolean,
  ) {
    const ice = grounded && this.iceSurface;
    const accel = grounded
      ? ice
        ? MOVE.ICE_ACCEL
        : MOVE.GROUND_ACCEL
      : MOVE.AIR_ACCEL;
    const decel = grounded
      ? ice
        ? MOVE.ICE_DECEL
        : MOVE.GROUND_DECEL
      : MOVE.AIR_DECEL;
    let speedScale = 1;
    if (crouching) speedScale = 0;
    else if (this.novaTimer > 0) speedScale = 0;
    else if (acting) speedScale = 0.5;
    if (this.hurtTimer > 0) {
      return;
    }
    const target = moveX * MOVE.MAX_RUN * speedScale;
    const current = this.body.velocity.x;
    const rate = (moveX !== 0 && speedScale > 0 ? accel : decel) / 1000;
    const step = rate * delta;
    const next =
      current < target
        ? Math.min(target, current + step)
        : Math.max(target, current - step);
    this.body.setVelocityX(next);
  }

  private updateFacing(moveX: number, acting: boolean) {
    if (moveX !== 0 && !acting && this.novaTimer <= 0) {
      this.facing = moveX;
    }
    this.setFlipX(this.facing < 0);
  }

  private updateFeedback(delta: number, grounded: boolean, crouching: boolean) {
    if (grounded && !this.wasGrounded) {
      this.signals.emit('land', this.lastFallSpeed);
      if (this.lastFallSpeed > 260) {
        this.setSquash(1.22, 0.78);
      }
    }
    this.lastFallSpeed = this.body.velocity.y;
    this.wasGrounded = grounded;

    if (grounded && !crouching && Math.abs(this.body.velocity.x) > 170) {
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) {
        this.stepTimer = 150;
        this.signals.emit('step');
      }
    } else {
      this.stepTimer = 0;
    }

    const lean = Phaser.Math.Clamp(this.body.velocity.x / MOVE.MAX_RUN, -1, 1);
    const target = grounded ? lean * 0.07 : lean * 0.05;
    this.rotation += (target - this.rotation) * Math.min(1, delta * 0.016);
    this.applySquash(delta);
  }

  private applySquash(delta: number) {
    const ease = Math.min(1, delta * 0.014);
    this.squashX += (1 - this.squashX) * ease;
    this.squashY += (1 - this.squashY) * ease;
    this.setScale(this.baseScale * this.squashX, this.baseScale * this.squashY);
  }

  private updateAnimation(
    grounded: boolean,
    wallSliding: boolean,
    crouching: boolean,
    stunned: boolean,
  ) {
    if (this.novaTimer > 0) {
      this.anims.stop();
      this.setTexture(KEY.SPRITESHEET.PLAYER_ATTACK, 4);
      return;
    }
    if (this.attackClock > 0) {
      this.anims.play(ANIM.ATTACK, true);
      return;
    }
    if (this.shootClock > 0) {
      this.anims.play(ANIM.SHOOT, true);
      return;
    }
    if (stunned) {
      this.anims.stop();
      this.setTexture(KEY.SPRITESHEET.PLAYER_RUN, 9);
      return;
    }
    if (wallSliding) {
      this.anims.stop();
      this.setTexture(KEY.SPRITESHEET.PLAYER_RUN, 3);
      return;
    }
    if (!grounded) {
      this.anims.stop();
      const vy = this.body.velocity.y;
      this.setTexture(
        KEY.SPRITESHEET.PLAYER_RUN,
        vy < -120 ? 3 : vy > 120 ? 8 : 4,
      );
      return;
    }
    if (crouching) {
      if (this.anims.currentAnim?.key !== ANIM.CROUCH_DOWN) {
        this.anims.play(ANIM.CROUCH_DOWN);
      }
      return;
    }
    if (this.anims.currentAnim?.key === ANIM.CROUCH_DOWN) {
      this.anims.play(ANIM.CROUCH_UP);
      return;
    }
    if (
      this.anims.currentAnim?.key === ANIM.CROUCH_UP &&
      this.anims.isPlaying
    ) {
      return;
    }
    if (Math.abs(this.body.velocity.x) > 24) {
      this.anims.play(ANIM.RUN, true);
      this.anims.timeScale = Phaser.Math.Clamp(
        Math.abs(this.body.velocity.x) / MOVE.MAX_RUN,
        0.65,
        1.15,
      );
    } else {
      this.anims.timeScale = 1;
      this.anims.play(ANIM.IDLE, true);
    }
  }
}
