import Phaser from 'phaser';

import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_TOP,
  KEY,
  PHASE_COUNT,
  RENDER_SCALE,
} from '../constants';
import type { EnemyType } from '../data/phases';
import {
  arenaGateX,
  type PhaseConfig,
  PHASES,
  worldWidthOf,
} from '../data/phases';
import { Effects } from '../graphics/effects';
import {
  drawCrumblePlatform,
  drawInkSurface,
  drawLantern,
  drawMoverPlatform,
  drawPit,
} from '../graphics/level-art';
import { configureHighResolutionCamera } from '../graphics/rendering';
import { orbTexture, TEX } from '../graphics/textures';
import { WeatherFx } from '../graphics/weather-fx';
import {
  getSession,
  getWeather,
  hexToNumber,
  LeaderboardApi,
  loadColorInfo,
  peekColorInfo,
  ProgressApi,
} from '../services';
import { Boss, type BossHost, Enemy, type MeleeBox, Player } from '../sprites';
import { audio } from '../systems/audio';
import { GameInput } from '../systems/input';
import { isTouchDevice, TouchControls } from '../systems/touch-controls';
import { Hud } from '../ui/Hud';
import { createButton, textStyle } from '../ui/widgets';

interface PhaseStartData {
  phaseId?: number;
}

interface CrumbleState {
  art: Phaser.GameObjects.Graphics;
  baseY: number;
  body: Phaser.GameObjects.Rectangle;
  triggered: boolean;
}

interface MoverState {
  art: Phaser.GameObjects.Container;
  baseX: number;
  baseY: number;
  body: Phaser.GameObjects.Rectangle;
  duration: number;
  horizontal: boolean;
  range: number;
}

interface CheckpointState {
  flame: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Image;
  lit: boolean;
  x: number;
}

const MAX_HP = 5;
const INK_MAX = 100;
const SHOT_INK_COST = 7;
const SAFE_MARGIN = 70;

type PlayState = 'boss' | 'dead' | 'intro' | 'play' | 'victory';

export class GamePhase extends Phaser.Scene {
  private arenaLeft = 0;
  private bgColor!: Phaser.GameObjects.Image;
  private bgGray!: Phaser.GameObjects.Image;
  private bgScale = 1;
  private boss?: Boss;
  private bossStarted = false;
  private bossWasHit = false;
  private checkpoints: CheckpointState[] = [];
  private config!: PhaseConfig;
  private crumbles: CrumbleState[] = [];
  private deaths = 0;
  private dropCount = 0;
  private dropGroup!: Phaser.Physics.Arcade.Group;
  private dropsCollected = 0;
  private effects!: Effects;
  private elapsed = 0;
  private finalScore = 0;
  private enemies!: Phaser.Physics.Arcade.Group;
  private gameInput!: GameInput;
  private gate!: Phaser.GameObjects.Rectangle;
  private gateArt!: Phaser.GameObjects.Graphics;
  private gateOpen = false;
  private gateSockets: Phaser.GameObjects.Arc[] = [];
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private hostiles!: Phaser.Physics.Arcade.Group;
  private hp = MAX_HP;
  private hud!: Hud;
  private ink = 0;
  private invulnerableUntil = 0;
  private kills = 0;
  private lastSafe = { x: 135, y: GROUND_TOP - 2 };
  private lastSafeAt = 0;
  private lookAhead = 0;
  private moverClock = 0;
  private movers: MoverState[] = [];
  private moverGroup!: Phaser.Physics.Arcade.Group;
  private crumbleGroup!: Phaser.Physics.Arcade.StaticGroup;
  private aura!: Phaser.GameObjects.Image;
  private hintTexts: { text: Phaser.GameObjects.Text; x: number }[] = [];
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private paused = false;
  private pauseMenu?: Phaser.GameObjects.Container;
  private player!: Player;
  private respawnPoint = { x: 135, y: GROUND_TOP - 2 };
  private shards = 0;
  private shots!: Phaser.Physics.Arcade.Group;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private spikeRects: Phaser.GameObjects.Rectangle[] = [];
  private state: PlayState = 'intro';
  private statsFlushed = false;
  private touch?: TouchControls;
  private unsafeUntil = 0;
  private wipeFront?: Phaser.GameObjects.Image;
  private worldShade!: Phaser.GameObjects.Rectangle;
  private worldWidth = 0;
  private weatherFx?: WeatherFx;

  constructor() {
    super(KEY.SCENE.GAME_PHASE);
  }

  init(data: PhaseStartData) {
    this.config = PHASES[data.phaseId ?? 1] ?? PHASES[1];
  }

  create() {
    configureHighResolutionCamera(this);
    this.resetState();
    this.createShotAnimations();
    this.effects = new Effects(this);
    this.gameInput = new GameInput(this);

    this.createBackground();
    this.createGroups();
    this.buildLevel();
    this.createPlayer();
    this.createCollectibles();
    this.createGate();
    this.createHints();
    this.createEnemies();
    this.createBoss();
    this.createColliders();

    this.hud = new Hud(this, this.config, isTouchDevice());
    this.touch = new TouchControls(this, () => {
      this.setPaused(!this.paused);
    });
    this.weatherFx = new WeatherFx(this, getWeather(), this.config.accent);
    const weather = getWeather();
    if (weather.live) {
      this.hud.setWeather(
        `${weather.city}: ${String(weather.temperature)}°C, ${weather.label}`,
      );
    }
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, TEX.VIGNETTE)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0)
      .setDepth(60);

    this.syncHud();
    this.setupCamera();
    this.bindPlayerSignals();
    this.setupDevKeys();
    void loadColorInfo(this.config.accent, this.config.colorName);

    audio.playMusic('explore', this.config.musicRoot);
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.weatherFx?.destroy();
      this.flushStats();
    });

    this.hud.banner(
      `FASE ${String(this.config.id)}  ·  ${this.config.name}`,
      this.config.intro,
      1700,
    );
    this.time.delayedCall(900, () => {
      this.state = 'play';
    });
  }

  update(time: number, delta: number) {
    const input = this.gameInput.poll();
    if (
      input.pressed.pause &&
      (this.state === 'play' || this.state === 'boss')
    ) {
      this.setPaused(!this.paused);
    }
    if (this.paused) {
      return;
    }
    if (this.state !== 'dead' && this.state !== 'victory') {
      this.elapsed += delta;
    }

    this.updateMovers(delta);
    this.updateBackground();
    if (this.state === 'intro' || this.state === 'dead') {
      return;
    }

    if (this.state !== 'victory') {
      this.player.setIce(this.config.ice);
      this.player.update(delta);
      this.updateSafeSpot(time);
      this.updateEnemies(time, delta);
      this.updateDrops();
      this.updateCheckpoints();
      this.updateArena();
      this.updateHostiles(delta);
      this.updateShotGlows();
      this.updateHints();
      this.boss?.update(time);
      this.checkFall();
      this.updateCameraLook(delta);
      this.updateHudTick();
    }
  }

  // ------------------------------------------------------------------ estado

  private resetState() {
    this.arenaLeft = arenaGateX(this.config);
    this.worldWidth = worldWidthOf(this.config);
    this.boss = undefined;
    this.bossStarted = false;
    this.bossWasHit = false;
    this.checkpoints = [];
    this.hintTexts = [];
    this.crumbles = [];
    this.deaths = 0;
    this.dropCount = 0;
    this.dropsCollected = 0;
    this.elapsed = 0;
    this.finalScore = 0;
    this.gateOpen = false;
    this.gateSockets = [];
    this.hp = MAX_HP;
    this.ink = 0;
    this.invulnerableUntil = 0;
    this.kills = 0;
    this.movers = [];
    this.moverClock = 0;
    this.overlayObjects = [];
    this.paused = false;
    this.pauseMenu = undefined;
    this.shards = 0;
    this.spikeRects = [];
    this.state = 'intro';
    this.statsFlushed = false;
    this.unsafeUntil = 0;
    this.lookAhead = 0;
    this.respawnPoint = { x: 135, y: GROUND_TOP - 2 };
    this.lastSafe = { x: 135, y: GROUND_TOP - 2 };
    this.lastSafeAt = 0;
    this.time.timeScale = 1;
    this.physics.world.timeScale = 1;
  }

  private createShotAnimations() {
    if (this.anims.exists('INK_FLY')) return;
    this.anims.create({
      frameRate: 16,
      frames: this.anims.generateFrameNumbers(KEY.SPRITESHEET.PROJECTILE_INK, {
        end: 5,
        start: 0,
      }),
      key: 'INK_FLY',
      repeat: -1,
    });
    this.anims.create({
      frameRate: 20,
      frames: this.anims.generateFrameNumbers(KEY.SPRITESHEET.PROJECTILE_INK, {
        end: 11,
        start: 6,
      }),
      key: 'INK_SPLAT',
    });
  }

  private flushStats() {
    if (this.statsFlushed) return;
    this.statsFlushed = true;
    ProgressApi.addStats({
      deaths: this.deaths,
      drops: this.dropsCollected,
      kills: this.kills,
      playMs: Math.round(this.elapsed),
    });
  }

  private setupDevKeys() {
    if (!import.meta.env.DEV) return;
    this.input.keyboard?.on('keydown-F9', () => {
      this.shards = 3;
      this.ink = INK_MAX;
      this.hud.setInk(1);
      this.hud.setShards(3);
      this.touch?.setNovaReady(true);
      this.openGate();
      this.player.setPosition(this.arenaLeft - 120, GROUND_TOP - 4);
    });
    this.input.keyboard?.on('keydown-F10', () => {
      this.shards = 3;
      this.openGate();
      if (!this.bossStarted) this.startBossFight();
      this.hp = MAX_HP;
      this.hud.setHealth(this.hp, MAX_HP);
      this.invulnerableUntil = Number.POSITIVE_INFINITY;
      this.time.delayedCall(3200, () => {
        this.boss?.hit(9999);
      });
    });
  }

  // --------------------------------------------------------------- cenario

  private createBackground() {
    const { id } = this.config;
    const done = ProgressApi.isComplete(id);
    this.bgGray = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, `BACKGROUND_PHASE_${String(id)}`)
      .setScrollFactor(0)
      .setDepth(-20);
    this.bgColor = this.add
      .image(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        `BACKGROUND_PHASE_${String(id)}_COLOR`,
      )
      .setScrollFactor(0)
      .setDepth(-19.8);

    // "Cobrir" a tela sem distorcer a arte (o original era esticado).
    const frame = this.bgGray.frame;
    this.bgScale = Math.max(
      (GAME_WIDTH * 1.16) / frame.realWidth,
      (GAME_HEIGHT * 1.04) / frame.realHeight,
    );
    this.bgGray.setScale(this.bgScale);
    this.bgColor.setScale(this.bgScale);
    // Fase ja concluida: o mundo continua colorido.
    this.setColorReveal(done ? 1 : 0);

    this.worldShade = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x08090c,
        done ? 0.05 : 0.22,
      )
      .setScrollFactor(0)
      .setDepth(-19);
  }

  private setColorReveal(amount: number) {
    const frame = this.bgColor.frame;
    if (amount <= 0) {
      this.bgColor.setVisible(false);
      return;
    }
    this.bgColor.setVisible(true);
    this.bgColor.setCrop(
      0,
      0,
      Math.max(1, frame.realWidth * amount),
      frame.realHeight,
    );
  }

  private updateBackground() {
    const span = this.bgGray.frame.realWidth * this.bgScale - GAME_WIDTH;
    const range = Math.max(1, this.worldWidth - GAME_WIDTH);
    const progress = Phaser.Math.Clamp(this.cameras.main.scrollX / range, 0, 1);
    const x = GAME_WIDTH / 2 + span / 2 - progress * span;
    this.bgGray.x = x;
    this.bgColor.x = x;
  }

  private createGroups() {
    this.solids = this.physics.add.staticGroup();
    this.crumbleGroup = this.physics.add.staticGroup();
    this.hazards = this.physics.add.staticGroup();
    this.moverGroup = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.enemies = this.physics.add.group();
    this.shots = this.physics.add.group({ allowGravity: false });
    this.hostiles = this.physics.add.group({ allowGravity: false });
    this.dropGroup = this.physics.add.group({ allowGravity: false });
  }

  private addSolid(x: number, top: number, width: number, height: number) {
    const rect = this.add.rectangle(
      x + width / 2,
      top + height / 2,
      width,
      height,
      0,
      0,
    );
    this.physics.add.existing(rect, true);
    this.solids.add(rect);
    return rect;
  }

  private buildLevel() {
    const { config } = this;
    this.physics.world.setBounds(0, -200, this.worldWidth, GAME_HEIGHT + 400);

    // Chao e abismos.
    let seed = config.id * 100;
    let previousEnd = 0;
    for (const [start, rawEnd] of config.ground) {
      const end = Number.isFinite(rawEnd) ? rawEnd : this.worldWidth;
      if (start > previousEnd) {
        drawPit(this, previousEnd, start, GROUND_TOP, config.accent);
      }
      this.addSolid(start, GROUND_TOP, end - start, 120);
      drawInkSurface(this, {
        accent: config.accent,
        depth: 96,
        seed: (seed += 7),
        top: GROUND_TOP,
        width: end - start,
        x: start,
      });
      previousEnd = end;
    }

    for (const platform of config.platforms) {
      const left = platform.x - platform.w / 2;
      if (platform.kind === 'crumble') {
        this.createCrumble(platform.x, platform.y, platform.w, (seed += 3));
        continue;
      }
      this.addSolid(left, platform.y, platform.w, 24);
      drawInkSurface(this, {
        accent: config.accent,
        depth: 24,
        hanging: true,
        seed: (seed += 5),
        top: platform.y,
        width: platform.w,
        x: left,
      });
    }

    for (const spec of config.movers) {
      this.createMover(
        spec.x,
        spec.y,
        spec.w,
        spec.axis,
        spec.range,
        spec.duration,
      );
    }

    for (const spike of config.spikes) {
      this.createSpikeRow(spike.x, spike.w);
    }

    for (const thorn of config.thorns) {
      this.loopHazard(thorn.x, thorn.period, thorn.offset, () => {
        this.spawnTimedSpike(thorn.x, 650, 700, 110);
      });
    }
    for (const drip of config.drips) {
      this.loopHazard(drip.x, drip.period, drip.offset, () => {
        this.spawnDrip(drip.x);
      });
    }

    for (const x of config.checkpoints) {
      const parts = drawLantern(this, x, GROUND_TOP, config.accent);
      this.checkpoints.push({
        flame: parts.flame,
        glow: parts.glow,
        lit: false,
        x,
      });
    }
  }

  private loopHazard(
    x: number,
    period: number,
    offset: number,
    action: () => void,
  ) {
    this.time.addEvent({
      callback: () => {
        // So gasta recursos quando o jogador esta perto.
        if (Math.abs(this.player.x - x) < 900 && this.state !== 'victory') {
          action();
        }
      },
      delay: period,
      loop: true,
      startAt: -offset,
    });
  }

  private createSpikeRow(centerX: number, width: number) {
    const count = Math.max(1, Math.round(width / 28));
    const start = centerX - width / 2;
    for (let index = 0; index < count; index++) {
      const x = start + (index + 0.5) * (width / count);
      this.add
        .image(x, GROUND_TOP + 1, TEX.SPIKE)
        .setOrigin(0.5, 1)
        .setDepth(14)
        .setScale(0.85, 0.75);
    }
    this.add
      .ellipse(
        centerX,
        GROUND_TOP - 2,
        width + 30,
        14,
        this.config.accent,
        0.12,
      )
      .setDepth(12);
    const rect = this.add.rectangle(
      centerX,
      GROUND_TOP - 12,
      width - 10,
      26,
      0,
      0,
    );
    this.physics.add.existing(rect, true);
    rect.setData('safeRespawn', true);
    this.hazards.add(rect);
    this.spikeRects.push(rect);
  }

  private createCrumble(x: number, top: number, width: number, seed: number) {
    const art = drawCrumblePlatform(this, width, this.config.accent, seed);
    art.setPosition(x, top);
    const body = this.add.rectangle(x, top + 12, width, 24, 0, 0);
    this.physics.add.existing(body, true);
    this.crumbleGroup.add(body);
    const state: CrumbleState = { art, baseY: top, body, triggered: false };
    body.setData('state', state);
    this.crumbles.push(state);
  }

  private triggerCrumble(state: CrumbleState) {
    if (state.triggered) return;
    state.triggered = true;
    this.tweens.add({
      duration: 55,
      repeat: 5,
      targets: state.art,
      x: state.art.x + 2.5,
      yoyo: true,
    });
    this.time.delayedCall(420, () => {
      const staticBody = state.body.body as Phaser.Physics.Arcade.StaticBody;
      staticBody.enable = false;
      this.effects.dust(state.body.x, state.baseY + 10, 10);
      this.tweens.add({
        alpha: 0,
        duration: 520,
        ease: 'Quad.In',
        targets: state.art,
        y: state.baseY + 260,
      });
      this.time.delayedCall(2800, () => {
        state.art.setPosition(state.body.x, state.baseY).setAlpha(0);
        staticBody.enable = true;
        state.triggered = false;
        this.tweens.add({ alpha: 1, duration: 350, targets: state.art });
      });
    });
  }

  private createMover(
    x: number,
    top: number,
    width: number,
    axis: 'x' | 'y',
    range: number,
    duration: number,
  ) {
    const art = drawMoverPlatform(this, width, this.config.accent);
    const body = this.add.rectangle(x, top + 11, width, 22, 0, 0);
    this.physics.add.existing(body);
    this.moverGroup.add(body);
    const arcade = body.body as Phaser.Physics.Arcade.Body;
    arcade.setAllowGravity(false).setImmovable(true).setFriction(1, 0);
    // Marcadores de trilho para o jogador antever o percurso.
    this.add
      .rectangle(
        axis === 'x' ? x + range / 2 : x,
        axis === 'x' ? top + 11 : top + 11 + range / 2,
        axis === 'x' ? range + width : 3,
        axis === 'x' ? 3 : range + 22,
        this.config.accent,
        0.16,
      )
      .setDepth(5);
    this.movers.push({
      art,
      baseX: x,
      baseY: top + 11,
      body,
      duration,
      horizontal: axis === 'x',
      range,
    });
  }

  private updateMovers(delta: number) {
    // Relogio proprio: um salto de tempo (aba em segundo plano) nao arremessa ninguem.
    this.moverClock += Math.min(delta, 50);
    for (const mover of this.movers) {
      const phase = (this.moverClock % (mover.duration * 2)) / mover.duration;
      const wave = 0.5 * (1 - Math.cos(Math.PI * phase));
      const targetX = mover.horizontal
        ? mover.baseX + mover.range * wave
        : mover.baseX;
      const targetY = mover.horizontal
        ? mover.baseY
        : mover.baseY + mover.range * wave;
      const arcade = mover.body.body as Phaser.Physics.Arcade.Body;
      // Velocidade calculada para chegar ao alvo (o jogador "pega carona"),
      // com teto para nunca passar de ~2x a velocidade normal da plataforma.
      const cruise = ((mover.range * Math.PI) / mover.duration) * 1000;
      const limit = Math.max(cruise * 2, 120);
      arcade.setVelocity(
        Phaser.Math.Clamp((targetX - mover.body.x) * 60, -limit, limit),
        Phaser.Math.Clamp((targetY - mover.body.y) * 60, -limit, limit),
      );
      mover.art.setPosition(mover.body.x, mover.body.y - 11);
    }
  }

  // ---------------------------------------------------------------- jogador

  private createPlayer() {
    this.player = new Player(
      this,
      this.respawnPoint.x,
      this.respawnPoint.y,
      this.gameInput,
    );
    this.player.setDepth(25);
    // Halo suave: o heroi e quase preto, o halo garante leitura em qualquer cenario.
    this.aura = this.add
      .image(this.player.x, this.player.y - 32, TEX.GLOW)
      .setTint(0xb7c8e0)
      .setAlpha(0.16)
      .setScale(1.5)
      .setDepth(24)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.physics.world.setBounds(0, -400, this.worldWidth, GAME_HEIGHT + 900);
  }

  private bindPlayerSignals() {
    const feet = () => ({ x: this.player.x, y: this.player.y });
    this.player.signals.on('jump', () => {
      audio.sfx('jump');
      this.effects.dust(feet().x, feet().y, 5);
    });
    this.player.signals.on('wall-jump', () => {
      audio.sfx('jump');
      this.effects.dust(feet().x, feet().y - 20, 6);
    });
    this.player.signals.on('land', (speed: number) => {
      if (speed > 300) {
        audio.sfx('land');
        this.effects.dust(feet().x, feet().y, 8);
      }
    });
    this.player.signals.on('step', () => {
      this.effects.dust(
        feet().x - this.player.facingDirection * 8,
        feet().y,
        2,
      );
    });
    this.player.signals.on('dash', () => {
      audio.sfx('dash');
      this.effects.dust(feet().x, feet().y, 7);
    });
    this.player.signals.on('attack', () => {
      audio.sfx('attack');
    });
    this.player.signals.on(
      'shoot',
      (origin: Phaser.Math.Vector2, direction: number) => {
        if (this.ink < SHOT_INK_COST) {
          this.effects.text(
            this.player.x,
            this.player.y - 88,
            `PRECISA DE ${String(SHOT_INK_COST)} DE TINTA`,
            '#d9f8f0',
            12,
          );
          return;
        }
        this.ink -= SHOT_INK_COST;
        this.hud.setInk(this.ink / INK_MAX);
        this.touch?.setNovaReady(false);
        this.fireShot(origin, direction);
      },
    );
    this.player.signals.on('melee', (melee: MeleeBox) => {
      this.onMelee(melee);
    });
    this.player.signals.on('nova-request', (accept: (ok: boolean) => void) => {
      if (this.ink >= INK_MAX) {
        this.ink = 0;
        accept(true);
        this.novaBurst();
      } else {
        accept(false);
        this.effects.text(
          this.player.x,
          this.player.y - 90,
          'TINTA INSUFICIENTE',
          '#c9cbd2',
          12,
        );
      }
    });
  }

  private setupCamera() {
    const camera = this.cameras.main;
    camera.setOrigin(0, 0);
    const horizontalPadding = (GAME_WIDTH * (RENDER_SCALE - 1)) / 2;
    const verticalPadding = (GAME_HEIGHT * (RENDER_SCALE - 1)) / 2;
    camera.setBounds(
      horizontalPadding,
      verticalPadding,
      this.worldWidth,
      GAME_HEIGHT,
    );
    // A fase e lateral: acompanhar Y desloca o chao para fora da tela quando
    // o canvas usa supersampling para TVs Full HD/4K.
    camera.startFollow(this.player, true, 0.1, 0, GAME_WIDTH / 2, 0);
    camera.scrollY = 0;
    camera.setDeadzone();
  }

  private updateCameraLook(delta: number) {
    if (this.state === 'boss' || this.bossStarted) return;
    this.lookAhead += (0 - this.lookAhead) * Math.min(1, delta * 0.0035);
    this.cameras.main.setFollowOffset(GAME_WIDTH / 2, 0);
  }

  private updateSafeSpot(time: number) {
    const player = this.player;
    if (
      player.isGrounded &&
      time > this.unsafeUntil &&
      time - this.lastSafeAt > 350 &&
      player.x < this.arenaLeft - 40 &&
      !player.isHurt()
    ) {
      const nearSpike = this.spikeRects.some(
        (rect) => Math.abs(rect.x - player.x) < rect.width / 2 + SAFE_MARGIN,
      );
      if (!nearSpike) {
        this.lastSafe = {
          x: player.x - player.facingDirection * 14,
          y: player.y - 2,
        };
        this.lastSafeAt = time;
      }
    }
  }

  private checkFall() {
    if (this.player.y > GAME_HEIGHT + 70) {
      this.hurtAndRespawn();
    }
  }

  private hurtAndRespawn() {
    const point = this.bossStarted ? this.respawnPoint : this.lastSafe;
    this.hp -= 1;
    this.hud.setHealth(this.hp, MAX_HP);
    this.hud.flashDamage();
    audio.sfx('hurt');
    if (this.hp <= 0) {
      this.killPlayer();
      return;
    }
    this.player.body.setVelocity(0, 0);
    this.player.setPosition(point.x, point.y);
    this.invulnerableUntil = this.time.now + 1300;
    this.effects.spark(point.x, point.y - 30, this.config.accent, 12, 160);
  }

  // ------------------------------------------------------------ colecionaveis

  private createCollectibles() {
    const palette = peekColorInfo(
      this.config.accent,
      this.config.colorName,
    ).palette.map(hexToNumber);
    let total = 0;
    for (const spec of this.config.drops) {
      for (let index = 0; index < spec.count; index++) {
        const arc = spec.arc
          ? Math.sin((Math.PI * index) / Math.max(1, spec.count - 1)) * spec.arc
          : 0;
        this.spawnDrop(
          spec.x + index * spec.dx,
          spec.y - arc,
          false,
          palette[total % palette.length],
        );
        total += 1;
      }
    }
    this.dropCount = total;

    this.config.shards.forEach((position, index) => {
      const color = palette[(index * 2 + 1) % palette.length];
      const shard = this.add
        .image(position.x, position.y, TEX.SHARD)
        .setTint(color)
        .setData('color', color)
        .setDepth(22);
      const glow = this.add
        .image(position.x, position.y, TEX.GLOW)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(21)
        .setScale(1.3)
        .setAlpha(0.7);
      this.physics.add.existing(shard);
      (shard.body as Phaser.Physics.Arcade.Body)
        .setAllowGravity(false)
        .setCircle(22, 4, 4);
      this.tweens.add({
        duration: 1500 + index * 200,
        ease: 'Sine.InOut',
        repeat: -1,
        targets: [shard, glow],
        y: position.y - 10,
        yoyo: true,
      });
      this.tweens.add({
        angle: 360,
        duration: 6000,
        repeat: -1,
        targets: shard,
      });
      this.tweens.add({
        alpha: 0.35,
        duration: 900,
        repeat: -1,
        targets: glow,
        yoyo: true,
      });
      this.physics.add.overlap(this.player, shard, () => {
        this.collectShard(shard, glow);
      });
    });
  }

  private spawnDrop(
    x: number,
    y: number,
    physical: boolean,
    color = this.config.accent,
  ) {
    const glow = this.add
      .image(x, y, TEX.GLOW)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(20)
      .setScale(0.42)
      .setAlpha(0.34);
    const drop = this.add
      .image(x, y, TEX.DROP)
      .setTint(color)
      .setDepth(21)
      .setScale(0.95)
      .setData('color', color)
      .setData('glow', glow);
    this.physics.add.existing(drop);
    this.dropGroup.add(drop);
    const body = drop.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(physical).setCircle(14, 0, 4).setBounce(0.45);
    if (physical) {
      body.setVelocity(
        Phaser.Math.Between(-140, 140),
        Phaser.Math.Between(-320, -180),
      );
      drop.setData('pickupAt', this.time.now + 350);
    } else {
      this.tweens.add({
        delay: Phaser.Math.Between(0, 700),
        duration: 900,
        ease: 'Sine.InOut',
        repeat: -1,
        targets: [drop, glow],
        y: y - 6,
        yoyo: true,
      });
    }
    return drop;
  }

  private updateDrops() {
    const player = this.player;
    for (const child of this.dropGroup.getChildren()) {
      const drop = child as Phaser.GameObjects.Image;
      if (!drop.active) continue;
      const glow = drop.getData('glow') as Phaser.GameObjects.Image | undefined;
      glow?.setPosition(drop.x, drop.y);
      const pickupAt = Number(drop.getData('pickupAt') ?? 0);
      if (this.time.now < pickupAt) continue;
      const distance = Phaser.Math.Distance.Between(
        drop.x,
        drop.y,
        player.x,
        player.y - 30,
      );
      if (distance < 46) {
        this.collectDrop(drop);
      } else if (distance < 120) {
        // Imã: as gotas voam ate o jogador quando ele chega perto.
        const body = drop.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        this.tweens.killTweensOf([drop, glow]);
        const angle = Phaser.Math.Angle.Between(
          drop.x,
          drop.y,
          player.x,
          player.y - 30,
        );
        body.setVelocity(Math.cos(angle) * 380, Math.sin(angle) * 380);
      }
    }
  }

  private collectDrop(drop: Phaser.GameObjects.Image) {
    const glow = drop.getData('glow') as Phaser.GameObjects.Image | undefined;
    const color = Number(drop.getData('color') ?? this.config.accent);
    this.tweens.killTweensOf([drop, glow]);
    glow?.destroy();
    drop.destroy();
    this.dropsCollected += 1;
    this.addInk(6);
    audio.sfx('collect');
    this.effects.spark(this.player.x, this.player.y - 30, color, 4, 120);
    if (this.dropsCollected % 20 === 0 && this.hp < MAX_HP) {
      this.heal(1);
    }
    this.hud.setDrops(this.dropsCollected, this.dropCount);
    this.updateScore();
  }

  private collectShard(
    shard: Phaser.GameObjects.Image,
    glow: Phaser.GameObjects.Image,
  ) {
    if (!shard.active) return;
    shard.setActive(false);
    (shard.body as Phaser.Physics.Arcade.Body).enable = false;
    this.shards += 1;
    const color = Number(shard.getData('color') ?? this.config.accent);
    this.updateScore();
    audio.sfx('shard');
    this.effects.ring(shard.x, shard.y, color, 5, 700);
    this.effects.spark(shard.x, shard.y, color, 26, 300);
    this.effects.text(
      shard.x,
      shard.y - 30,
      `COR ${String(this.shards)}/3`,
      '#ffffff',
      18,
    );
    this.tweens.killTweensOf([shard, glow]);
    this.tweens.add({
      alpha: 0,
      duration: 400,
      onComplete: () => {
        shard.destroy();
        glow.destroy();
      },
      scale: 2.4,
      targets: [shard, glow],
    });
    this.hud.setShards(this.shards);
    if (this.shards >= 3) {
      this.openGate();
    } else {
      this.hud.setObjective(`${String(this.shards)} / 3 CORES`);
    }
  }

  private addInk(amount: number) {
    this.ink = Math.min(INK_MAX, this.ink + amount);
    this.hud.setInk(this.ink / INK_MAX);
    this.touch?.setNovaReady(this.ink >= INK_MAX);
  }

  private heal(amount: number) {
    this.hp = Math.min(MAX_HP, this.hp + amount);
    this.hud.setHealth(this.hp, MAX_HP);
    audio.sfx('heal');
    this.effects.text(
      this.player.x,
      this.player.y - 80,
      '+1 VIDA',
      '#ffffff',
      16,
    );
    this.effects.spark(this.player.x, this.player.y - 30, 0xffffff, 14, 180);
  }

  private updateCheckpoints() {
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.lit || Math.abs(this.player.x - checkpoint.x) > 46)
        continue;
      checkpoint.lit = true;
      this.respawnPoint = { x: checkpoint.x, y: GROUND_TOP - 2 };
      checkpoint.flame.setAlpha(1);
      checkpoint.glow.setAlpha(0.8);
      this.tweens.add({
        alpha: 0.4,
        duration: 700,
        repeat: -1,
        targets: checkpoint.glow,
        yoyo: true,
      });
      this.tweens.add({
        duration: 300,
        repeat: -1,
        scale: 1.25,
        targets: checkpoint.flame,
        yoyo: true,
      });
      audio.sfx('checkpoint');
      this.effects.ring(
        checkpoint.x,
        GROUND_TOP - 55,
        this.config.accent,
        3,
        600,
      );
      this.effects.text(
        checkpoint.x,
        GROUND_TOP - 110,
        'CHECKPOINT',
        '#ffffff',
        15,
      );
      if (this.hp < MAX_HP) this.heal(1);
    }
  }

  // ------------------------------------------------------------------ portao

  private createGate() {
    const x = this.arenaLeft;
    this.gateArt = this.add.graphics().setDepth(31);
    this.gateArt.fillStyle(0x07080b, 1);
    this.gateArt.fillRoundedRect(x - 20, 96, 40, GROUND_TOP - 96, 6);
    this.gateArt.lineStyle(3, this.config.accent, 0.8);
    this.gateArt.strokeRoundedRect(x - 20, 96, 40, GROUND_TOP - 96, 6);
    this.gateArt.fillStyle(0x0b0b10, 1);
    this.gateArt.fillTriangle(x - 28, 100, x + 28, 100, x, 60);
    for (let index = 0; index < 3; index++) {
      const socket = this.add
        .circle(x, 170 + index * 62, 13, 0x111318, 1)
        .setStrokeStyle(3, this.config.accent, 0.9)
        .setDepth(32);
      this.gateSockets.push(socket);
    }
    this.gate = this.add.rectangle(
      x,
      (96 + GROUND_TOP) / 2,
      40,
      GROUND_TOP - 96,
      0,
      0,
    );
    this.physics.add.existing(this.gate, true);
    this.add
      .text(x, 40, 'SELADO', textStyle(12, '#c9cbd2', 'monospace'))
      .setOrigin(0.5)
      .setDepth(32)
      .setName('gate-label');
  }

  /** Dicas do tutorial: aparecem suavemente quando o jogador se aproxima. */
  private createHints() {
    const touch = isTouchDevice();
    for (const hint of this.config.hints ?? []) {
      const text = this.add
        .text(hint.x, 205, touch ? hint.touch : hint.keys, {
          ...textStyle(16, '#ffffff', 'Georgia, serif'),
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setAlpha(0);
      this.hintTexts.push({ text, x: hint.x });
    }
  }

  private updateHints() {
    // So a dica mais proxima aparece, para os textos nunca se sobreporem.
    let nearest: { text: Phaser.GameObjects.Text; x: number } | undefined;
    for (const hint of this.hintTexts) {
      if (
        !nearest ||
        Math.abs(this.player.x - hint.x) < Math.abs(this.player.x - nearest.x)
      ) {
        nearest = hint;
      }
    }
    for (const hint of this.hintTexts) {
      const distance = Math.abs(this.player.x - hint.x);
      const target =
        hint === nearest ? Phaser.Math.Clamp(1.4 - distance / 240, 0, 0.9) : 0;
      hint.text.setAlpha(hint.text.alpha + (target - hint.text.alpha) * 0.15);
    }
  }

  private openGate() {
    if (this.gateOpen) return;
    this.gateOpen = true;
    audio.sfx('gate');
    this.gateSockets.forEach((socket) => {
      socket.setFillStyle(this.config.accent, 1);
    });
    const body = this.gate.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = false;
    this.gateArt.destroy();
    this.gateSockets.forEach((socket) => {
      socket.destroy();
    });
    this.gateSockets = [];
    this.children.getByName('gate-label')?.destroy();
    this.effects.ring(this.arenaLeft, 300, this.config.accent, 8, 900);
    this.hud.setObjective('O PORTÃO SE ABRIU');
    this.hud.banner('PORTÃO ABERTO', 'Enfrente o chefe', 1400);
    this.cameras.main.shake(300, 0.006);
  }

  private updateArena() {
    if (
      this.gateOpen &&
      !this.bossStarted &&
      this.player.x > this.arenaLeft + 150
    ) {
      this.startBossFight();
    }
  }

  // ------------------------------------------------------------------ chefe

  private createBoss() {
    const host: BossHost = {
      arena: { left: this.arenaLeft + 90, right: this.worldWidth - 30 },
      config: this.config,
      effects: this.effects,
      fireOrb: (x, y, angle, speed, gravity) => {
        this.fireOrb(x, y, angle, speed, gravity);
      },
      fireHomingOrb: (x, y, angle, speed, turnRate, trackMs) => {
        this.fireHomingOrb(x, y, angle, speed, turnRate, trackMs);
      },
      player: this.player,
      scene: this,
      shake: (ms, intensity) => {
        this.cameras.main.shake(ms, intensity);
      },
      spawnMinion: (type, x, y) => {
        this.spawnMinion(type, x, y);
      },
      spawnTimedSpike: (x, telegraphMs, activeMs, height) => {
        this.spawnTimedSpike(x, telegraphMs, activeMs, height);
      },
      spawnWave: (x, direction, speed) => {
        this.spawnWave(x, direction, speed);
      },
    };
    this.boss = new Boss(host, {
      onDefeated: () => {
        this.onBossDefeated();
      },
      onHealth: (health, max) => {
        this.hud.setBoss(health / max);
      },
      onPhase: (phase) => {
        this.hostiles.clear(true, true);
        this.hud.banner(
          phase === 1 ? 'O CHEFE ENFURECE' : 'ÚLTIMO FÔLEGO',
          `Fase ${String(phase + 1)} da luta`,
          900,
        );
        audio.playMusic(
          'boss',
          this.config.musicRoot * (phase === 2 ? 1.12 : 1),
        );
      },
    });
  }

  private startBossFight() {
    this.bossStarted = true;
    this.state = 'boss';
    this.respawnPoint = { x: this.arenaLeft + 200, y: GROUND_TOP - 2 };
    const camera = this.cameras.main;
    camera.setFollowOffset(GAME_WIDTH / 2, 0);
    camera.startFollow(this.player, true, 0.12, 0);
    camera.scrollY = 0;
    camera.shake(220, 0.006);
    this.hud.showBoss(this.config.bossName);
    this.hud.setBoss(1);
    this.hud.setObjective('DERROTE O CHEFE');
    audio.playMusic('boss', this.config.musicRoot);
    this.time.delayedCall(1000, () => {
      this.boss?.begin();
    });
  }

  // ---------------------------------------------------------------- inimigos

  private createEnemies() {
    for (const spec of this.config.enemies) {
      this.addEnemy(new Enemy(this, spec, this.config.id));
    }
  }

  private addEnemy(enemy: Enemy) {
    this.enemies.add(enemy);
    enemy.setupBody();
  }

  private spawnMinion(type: EnemyType, x: number, y: number) {
    const enemy = new Enemy(this, { type, x, y }, this.config.id);
    this.addEnemy(enemy);
    enemy.setData('minion', true);
  }

  private updateEnemies(time: number, delta: number) {
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) continue;
      if (enemy.y > GAME_HEIGHT + 80) {
        enemy.destroy();
        continue;
      }
      // Inimigos longe da tela ficam adormecidos (desempenho e justica).
      if (
        Math.abs(enemy.x - this.player.x) > 1000 &&
        !enemy.getData('minion')
      ) {
        enemy.setVelocityX(0);
        continue;
      }
      enemy.updateAI(time, delta, this.player, (spitter) => {
        this.spit(spitter);
      });
    }
  }

  private spit(enemy: Enemy) {
    const origin = enemy.spitOrigin;
    const angle = Phaser.Math.Angle.Between(
      origin.x,
      origin.y,
      this.player.x,
      this.player.y - 30,
    );
    this.effects.spark(origin.x, origin.y, this.config.accent, 8, 120);
    audio.sfx('shoot');
    this.fireOrb(
      origin.x,
      origin.y,
      angle - 0.1,
      250 + this.config.id * 10,
      260,
    );
  }

  private hitEnemy(enemy: Enemy, damage: number, sourceX: number) {
    if (!enemy.active) return;
    const dead = enemy.takeHit(damage, sourceX, this.time.now);
    this.effects.flash(enemy, 90);
    this.effects.ink(enemy.x, enemy.y - enemy.displayHeight / 2, 4);
    audio.sfx('hit');
    if (dead) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: Enemy) {
    this.kills += 1;
    this.updateScore();
    this.addInk(14);
    audio.sfx('enemy-die');
    const center = { x: enemy.x, y: enemy.y - enemy.displayHeight / 2 };
    this.effects.ink(center.x, center.y, 14);
    this.effects.spark(center.x, center.y, this.config.accent, 10, 180);
    const rewards = enemy.enemyType === 'brute' ? 4 : 2;
    for (let index = 0; index < rewards; index++) {
      this.spawnDrop(center.x, center.y, true);
    }
    enemy.destroy();
    this.hitStop(50);
  }

  private hitStop(ms: number) {
    if (this.state === 'victory') return;
    this.physics.world.pause();
    window.setTimeout(() => {
      if (!this.paused) this.physics.world.resume();
    }, ms);
  }

  // ---------------------------------------------------------------- combate

  private onMelee(melee: MeleeBox) {
    const { box, swing, stage } = melee;
    // Arco visual do pincel (a arte ja tem o borrao; isto reforca o impacto).
    if (stage === 1) {
      this.effects.spark(box.centerX, box.centerY, 0xffffff, 5, 90);
    }
    let connected = false;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active || enemy.getData('swing') === swing) continue;
      const body = enemy.body;
      const rect = new Phaser.Geom.Rectangle(
        body.x,
        body.y,
        body.width,
        body.height,
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(box, rect)) {
        enemy.setData('swing', swing);
        this.hitEnemy(enemy, 2, this.player.x);
        connected = true;
      }
    }
    const boss = this.boss;
    if (boss?.isVulnerable && boss.sprite.getData('swing') !== swing) {
      const body = boss.sprite.body as Phaser.Physics.Arcade.Body;
      const rect = new Phaser.Geom.Rectangle(
        body.x,
        body.y,
        body.width,
        body.height,
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(box, rect)) {
        boss.sprite.setData('swing', swing);
        this.damageBoss(3);
        connected = true;
      }
    }
    // Cortar a escuridao: o pincel destroi orbes inimigos e recarrega tinta.
    for (const child of this.hostiles.getChildren()) {
      const hostile = child as Phaser.Physics.Arcade.Image;
      if (!hostile.active || hostile.getData('wave')) continue;
      if (
        Phaser.Geom.Intersects.RectangleToRectangle(box, hostile.getBounds())
      ) {
        this.effects.spark(hostile.x, hostile.y, this.config.accent, 8, 160);
        hostile.destroy();
        this.addInk(4);
        audio.sfx('hit');
      }
    }
    if (connected) {
      this.cameras.main.shake(70, 0.003);
    }
  }

  private damageBoss(amount: number) {
    const boss = this.boss;
    if (!boss) return;
    if (boss.hit(amount)) {
      this.addInk(2);
      this.bossWasHit = true;
      this.effects.text(
        boss.sprite.x,
        boss.sprite.y - 110,
        `-${String(amount)}`,
        amount >= 3 ? '#ffffff' : '#d9f8f0',
        amount >= 3 ? 22 : 16,
      );
      this.cameras.main.shake(80, 0.005);
    }
  }

  private fireShot(origin: Phaser.Math.Vector2, direction: number) {
    const angle = this.shotAngle(origin, direction);
    const shot = this.physics.add
      .sprite(origin.x, origin.y, KEY.SPRITESHEET.PROJECTILE_INK, 0)
      .setScale(0.68)
      .setFlipX(direction < 0)
      .setRotation(direction > 0 ? angle : angle - Math.PI)
      .setDepth(27);
    this.shots.add(shot);
    const body = shot.body as Phaser.Physics.Arcade.Body;
    body
      .setAllowGravity(false)
      .setSize(70, 40)
      .setOffset(shot.width / 2 - 35, shot.height / 2 - 20);
    const speed = 680;
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    shot.setData('damage', 2);
    // Brilho na cor da fase: o tiro e preto e sumiria em cenarios escuros.
    const glow = this.add
      .image(shot.x, shot.y, TEX.GLOW)
      .setTint(this.config.accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.75)
      .setScale(0.68)
      .setDepth(26);
    shot.setData('glow', glow);
    shot.once('destroy', () => {
      glow.destroy();
    });
    shot.anims.play('INK_FLY');
    audio.sfx('shoot');
    this.time.delayedCall(1100, () => {
      if (shot.active) shot.destroy();
    });
  }

  private shotAngle(origin: Phaser.Math.Vector2, direction: number) {
    const candidates: { distance: number; x: number; y: number }[] = [];
    const addCandidate = (x: number, y: number) => {
      const forward = (x - origin.x) * direction;
      if (forward <= 0 || forward > 760 || Math.abs(y - origin.y) > 320) {
        return;
      }
      candidates.push({
        distance: Phaser.Math.Distance.Between(origin.x, origin.y, x, y),
        x,
        y,
      });
    };

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (enemy.active) {
        addCandidate(enemy.x, enemy.y - enemy.displayHeight * 0.45);
      }
    }
    if (this.boss?.isVulnerable) {
      addCandidate(this.boss.sprite.x, this.boss.sprite.y);
    }

    if (candidates.length === 0) return direction > 0 ? 0 : Math.PI;
    const target = candidates.sort((a, b) => a.distance - b.distance)[0];
    const base = direction > 0 ? 0 : Math.PI;
    const desired = Phaser.Math.Angle.Between(
      origin.x,
      origin.y,
      target.x,
      target.y,
    );
    const offset = Phaser.Math.Clamp(
      Phaser.Math.Angle.Wrap(desired - base),
      -0.52,
      0.52,
    );
    return base + offset;
  }

  private splashShot(shot: Phaser.Physics.Arcade.Sprite) {
    if (!shot.active || shot.getData('splashing')) return;
    shot.setData('splashing', true);
    shot.body?.stop();
    (shot.body as Phaser.Physics.Arcade.Body).enable = false;
    shot.anims.play('INK_SPLAT');
    shot.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      shot.destroy();
    });
  }

  private novaBurst() {
    const { x } = this.player;
    const y = this.player.y - 40;
    audio.sfx('nova');
    this.effects.ring(x, y, 0xffffff, 9, 700);
    this.effects.ring(x, y, this.config.accent, 12, 900);
    this.effects.spark(x, y, 0xc38bff, 40, 480);
    this.effects.spark(x, y, this.config.accent, 30, 420);
    this.cameras.main.shake(320, 0.014);
    this.cameras.main.flash(180, 220, 200, 255);
    this.hud.setInk(0);
    this.touch?.setNovaReady(false);
    this.invulnerableUntil = Math.max(
      this.invulnerableUntil,
      this.time.now + 700,
    );

    for (const child of [...this.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (
        enemy.active &&
        Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) < 380
      ) {
        this.hitEnemy(enemy, 6, x);
      }
    }
    for (const child of [...this.hostiles.getChildren()]) {
      const hostile = child as Phaser.Physics.Arcade.Image;
      if (
        hostile.active &&
        Phaser.Math.Distance.Between(x, y, hostile.x, hostile.y) < 460
      ) {
        this.effects.spark(hostile.x, hostile.y, this.config.accent, 6, 140);
        hostile.destroy();
      }
    }
    const boss = this.boss;
    if (
      boss?.isVulnerable &&
      Phaser.Math.Distance.Between(x, y, boss.sprite.x, boss.sprite.y) < 520
    ) {
      this.damageBoss(10);
    }
  }

  private fireOrb(
    x: number,
    y: number,
    angle: number,
    speed: number,
    gravity = 0,
  ) {
    const orb = this.physics.add
      .image(x, y, orbTexture(this.config.id))
      .setDepth(26);
    this.hostiles.add(orb);
    orb.setCircle(13, 9, 9);
    const body = orb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(gravity !== 0).setGravityY(gravity);
    orb.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    orb.setData('born', this.time.now);
    this.tweens.add({
      duration: 260,
      repeat: -1,
      scale: 1.15,
      targets: orb,
      yoyo: true,
    });
    return orb;
  }

  private fireHomingOrb(
    x: number,
    y: number,
    angle: number,
    speed: number,
    turnRate: number,
    trackMs: number,
  ) {
    const orb = this.fireOrb(x, y, angle, speed);
    orb.setData('homingUntil', trackMs);
    orb.setData('speed', speed);
    orb.setData('turnRate', turnRate);
    orb.setTint(0xffffff);
    return orb;
  }

  private spawnWave(x: number, direction: number, speed: number) {
    const wave = this.physics.add
      .image(x, GROUND_TOP - 22, TEX.SPIKE)
      .setTint(this.config.accent)
      .setScale(1.6, 0.9)
      .setDepth(26);
    this.hostiles.add(wave);
    const body = wave.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setSize(30, 26).setOffset(1, 16);
    wave.setVelocityX(direction * speed);
    wave.setData('wave', true);
    wave.setData('born', this.time.now);
  }

  private spawnTimedSpike(
    x: number,
    telegraphMs: number,
    activeMs: number,
    height: number,
  ) {
    const warning = this.add
      .ellipse(x, GROUND_TOP - 4, 96, 16, this.config.accent, 0.28)
      .setDepth(12);
    this.tweens.add({
      alpha: 0.7,
      duration: Math.max(120, telegraphMs / 4),
      repeat: 3,
      scaleX: 1.15,
      targets: warning,
      yoyo: true,
    });
    this.time.delayedCall(telegraphMs, () => {
      warning.destroy();
      if (this.state === 'victory') return;
      const spikes = [-26, 0, 26].map((offset) =>
        this.add
          .image(x + offset, GROUND_TOP + 2, TEX.SPIKE)
          .setOrigin(0.5, 1)
          .setDepth(15)
          .setScale(0.9, 0.01),
      );
      const rect = this.add.rectangle(
        x,
        GROUND_TOP - height / 2,
        64,
        height,
        0,
        0,
      );
      this.physics.add.existing(rect, true);
      this.hazards.add(rect);
      this.tweens.add({
        duration: 90,
        ease: 'Back.Out',
        scaleY: height / 44,
        targets: spikes,
      });
      audio.sfx('hit');
      this.effects.dust(x, GROUND_TOP, 6);
      this.time.delayedCall(activeMs, () => {
        this.tweens.add({
          duration: 160,
          onComplete: () => {
            for (const spike of spikes) spike.destroy();
          },
          scaleY: 0.01,
          targets: spikes,
        });
        rect.destroy();
      });
    });
  }

  private spawnDrip(x: number) {
    const marker = this.add
      .ellipse(x, GROUND_TOP - 4, 40, 10, this.config.accent, 0.3)
      .setDepth(12);
    this.tweens.add({
      alpha: 0.8,
      duration: 200,
      repeat: 2,
      targets: marker,
      yoyo: true,
    });
    this.time.delayedCall(700, () => {
      marker.destroy();
      if (this.state === 'victory') return;
      this.fireOrb(x, -20, Math.PI / 2, 400);
    });
  }

  private updateShotGlows() {
    for (const child of this.shots.getChildren()) {
      const shot = child as Phaser.Physics.Arcade.Sprite;
      const glow = shot.getData('glow') as Phaser.GameObjects.Image | undefined;
      glow?.setPosition(shot.x, shot.y);
    }
  }

  private updateHostiles(delta: number) {
    for (const child of [...this.hostiles.getChildren()]) {
      const hostile = child as Phaser.Physics.Arcade.Image;
      if (!hostile.active) continue;
      const age = this.time.now - Number(hostile.getData('born') ?? 0);
      const homingUntil = Number(hostile.getData('homingUntil') ?? 0);
      if (age < homingUntil) {
        const body = hostile.body as Phaser.Physics.Arcade.Body;
        const current = Math.atan2(body.velocity.y, body.velocity.x);
        const desired = Phaser.Math.Angle.Between(
          hostile.x,
          hostile.y,
          this.player.x,
          this.player.y - 28,
        );
        const turnRate = Number(hostile.getData('turnRate') ?? 1.8);
        const angle = Phaser.Math.Angle.RotateTo(
          current,
          desired,
          turnRate * (delta / 1000),
        );
        const speed = Number(hostile.getData('speed') ?? 280);
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        hostile.setRotation(angle);
      }
      const left = this.bossStarted ? this.arenaLeft : -50;
      if (
        hostile.y > GAME_HEIGHT + 60 ||
        hostile.y < -120 ||
        hostile.x < left - 60 ||
        hostile.x > this.worldWidth + 60 ||
        age > 9000
      ) {
        hostile.destroy();
      }
    }
  }

  // ----------------------------------------------------------- colisoes gerais

  private createColliders() {
    const player = this.player;
    this.physics.add.collider(player, this.solids);
    this.physics.add.collider(player, this.gate);
    this.physics.add.collider(player, this.moverGroup, () => {
      this.unsafeUntil = this.time.now + 150;
    });
    this.physics.add.collider(
      player,
      this.crumbleGroup,
      (_player, platform) => {
        this.unsafeUntil = this.time.now + 150;
        const standing =
          player.body.bottom <= (platform as Phaser.GameObjects.Rectangle).y;
        const state = (platform as Phaser.GameObjects.Rectangle).getData(
          'state',
        ) as CrumbleState | undefined;
        if (state && standing) this.triggerCrumble(state);
      },
    );

    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.enemies, this.moverGroup);
    this.physics.add.collider(this.enemies, this.crumbleGroup);
    this.physics.add.collider(this.dropGroup, this.solids);
    this.physics.add.collider(this.enemies, this.gate);

    this.physics.add.collider(this.shots, this.solids, (shot) => {
      this.splashShot(shot as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.collider(this.shots, this.gate, (shot) => {
      this.splashShot(shot as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.collider(
      this.hostiles,
      this.solids,
      (hostile) => {
        (hostile as Phaser.Physics.Arcade.Image).destroy();
      },
      (hostile) => !(hostile as Phaser.Physics.Arcade.Image).getData('wave'),
    );

    this.physics.add.overlap(this.shots, this.enemies, (shot, enemy) => {
      if (!(shot as Phaser.Physics.Arcade.Sprite).active) return;
      this.hitEnemy(
        enemy as Enemy,
        Number((shot as Phaser.Physics.Arcade.Sprite).getData('damage') ?? 1),
        (shot as Phaser.Physics.Arcade.Sprite).x,
      );
      this.splashShot(shot as Phaser.Physics.Arcade.Sprite);
    });
    if (this.boss) {
      this.physics.add.overlap(this.shots, this.boss.sprite, (_boss, shot) => {
        if (!(shot as Phaser.Physics.Arcade.Sprite).active) return;
        if (this.boss?.isVulnerable) {
          this.damageBoss(
            Number(
              (shot as Phaser.Physics.Arcade.Sprite).getData('damage') ?? 1,
            ),
          );
          this.splashShot(shot as Phaser.Physics.Arcade.Sprite);
        }
      });
      this.physics.add.overlap(player, this.boss.sprite, () => {
        if (this.boss?.isDangerous) {
          this.damagePlayer(1, this.boss.sprite.x);
        }
      });
    }

    this.physics.add.overlap(player, this.enemies, (_player, enemyObject) => {
      const enemy = enemyObject as Enemy;
      const enemyBody = enemy.body;
      const stomping =
        enemy.stompable &&
        player.body.velocity.y > 30 &&
        player.body.bottom <= enemyBody.top + 30;
      if (stomping) {
        audio.sfx('stomp');
        this.hitEnemy(enemy, 2, player.x);
        player.bounce();
        this.effects.text(enemy.x, enemy.y - 60, 'PISÃO!', '#ffffff', 14);
      } else {
        this.damagePlayer(1, enemy.x);
      }
    });
    this.physics.add.overlap(player, this.hostiles, (_player, hostile) => {
      const object = hostile as Phaser.Physics.Arcade.Image;
      if (!object.active) return;
      const hurt = this.damagePlayer(1, object.x);
      if (hurt && !object.getData('wave')) {
        this.effects.spark(object.x, object.y, this.config.accent, 8, 150);
        object.destroy();
      }
    });
    this.physics.add.overlap(player, this.hazards, (_player, hazard) => {
      const rect = hazard as Phaser.GameObjects.Rectangle;
      if (rect.getData('safeRespawn')) {
        if (this.invulnerableUntil > this.time.now) return;
        if (this.player.isDashing()) return;
        this.hurtAndRespawn();
      } else {
        this.damagePlayer(1, rect.x);
      }
    });
  }

  /** Devolve true se o dano foi aplicado (false: esquiva ou invulneravel). */
  private damagePlayer(amount: number, sourceX: number): boolean {
    if (
      this.state === 'dead' ||
      this.state === 'victory' ||
      this.time.now < this.invulnerableUntil
    ) {
      return false;
    }
    if (this.player.isDashing()) {
      this.invulnerableUntil = this.time.now + 240;
      this.effects.text(
        this.player.x,
        this.player.y - 90,
        'ESQUIVA',
        '#bfe9ff',
        14,
      );
      this.addInk(3);
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableUntil = this.time.now + 1250;
    this.player.knockback(sourceX);
    this.hud.setHealth(this.hp, MAX_HP);
    this.hud.pulseHeart(this.hp);
    this.hud.flashDamage();
    this.cameras.main.shake(150, 0.011);
    this.effects.ink(this.player.x, this.player.y - 30, 8);
    audio.sfx('hurt');
    this.hitStop(60);
    if (this.hp <= 0) {
      this.killPlayer();
    }
    if (this.boss?.isDangerous) {
      this.bossWasHit = this.bossWasHit || false;
    }
    return true;
  }

  private killPlayer() {
    if (this.state === 'dead') return;
    const wasBoss = this.bossStarted;
    this.state = 'dead';
    this.deaths += 1;
    this.player.freeze();
    this.boss?.halt();
    audio.sfx('death');
    this.effects.ink(this.player.x, this.player.y - 30, 24);
    this.effects.ring(this.player.x, this.player.y - 30, 0xffffff, 4, 600);
    this.player.setVisible(false);
    this.hostiles.clear(true, true);
    this.cameras.main.fadeOut(650, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.respawnAfterDeath(wasBoss);
    });
  }

  private respawnAfterDeath(wasBoss: boolean) {
    this.hp = MAX_HP;
    this.hud.setHealth(this.hp, MAX_HP);
    this.player.unfreeze();
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y);
    this.player.body.setVelocity(0, 0);
    this.player.setVisible(true);
    this.invulnerableUntil = this.time.now + 1600;
    this.bossWasHit = false;
    if (wasBoss) {
      this.boss?.reset();
      this.hud.setBoss(1);
      this.time.delayedCall(900, () => {
        this.boss?.begin();
      });
    }
    this.state = wasBoss ? 'boss' : 'play';
    this.cameras.main.fadeIn(450, 0, 0, 0);
  }

  // --------------------------------------------------------------- HUD e pausa

  private syncHud() {
    this.hud.setHealth(this.hp, MAX_HP);
    this.hud.setInk(this.ink / INK_MAX);
    this.hud.setDrops(this.dropsCollected, this.dropCount);
    this.hud.setShards(this.shards);
    this.hud.setScore(0);
    this.hud.setObjective('0 / 3 CORES');
  }

  private updateHudTick() {
    this.aura.setPosition(this.player.x, this.player.y - 32);
    this.aura.setVisible(this.player.visible);
    // Pisca o jogador enquanto esta invulneravel.
    this.player.setAlpha(
      this.time.now < this.invulnerableUntil &&
        Math.floor(this.time.now / 70) % 2 === 0
        ? 0.4
        : 1,
    );
  }

  private setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      this.anims.pauseAll();
      this.gameInput.reset();
      this.showPauseMenu();
    } else {
      this.physics.world.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      this.anims.resumeAll();
      this.pauseMenu?.destroy(true);
      this.pauseMenu = undefined;
    }
  }

  private showPauseMenu() {
    const shade = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x050608,
        0.78,
      )
      .setScrollFactor(0);
    const title = this.add
      .text(GAME_WIDTH / 2, 130, 'PAUSADO', textStyle(38))
      .setOrigin(0.5)
      .setScrollFactor(0);
    const accent = this.config.accent;
    const items: Phaser.GameObjects.GameObject[] = [shade, title];
    const entries: [string, () => void][] = [
      [
        'CONTINUAR',
        () => {
          this.setPaused(false);
        },
      ],
      [
        audio.isMuted ? 'SOM: DESLIGADO' : 'SOM: LIGADO',
        () => {
          audio.toggleMute();
          this.setPaused(false);
          this.setPaused(true);
        },
      ],
      [
        'REINICIAR FASE',
        () => {
          this.setPaused(false);
          this.scene.restart({ phaseId: this.config.id });
        },
      ],
      [
        'VOLTAR AO MAPA',
        () => {
          this.setPaused(false);
          this.leaveToLobby();
        },
      ],
    ];
    entries.forEach(([label, action], index) => {
      items.push(
        createButton(this, GAME_WIDTH / 2, 215 + index * 62, label, action, {
          accent,
          depth: 401,
        }),
      );
    });
    this.pauseMenu = this.add
      .container(0, 0, items)
      .setDepth(400)
      .setScrollFactor(0);
  }

  private leaveToLobby() {
    audio.stopMusic();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(KEY.SCENE.LOBBY);
    });
  }

  // --------------------------------------------------------------- vitoria

  /** Placar exibido durante a fase (o bonus de tempo/vida so entra no fim). */
  private updateScore() {
    this.hud.setScore(
      this.dropsCollected * 15 + this.shards * 250 + this.kills * 40,
    );
  }

  private computeScore() {
    const parSeconds = this.config.length / 22;
    const seconds = this.elapsed / 1000;
    const timeBonus = Math.max(0, Math.round((parSeconds * 2 - seconds) * 4));
    const raw =
      this.dropsCollected * 15 +
      this.shards * 250 +
      this.hp * 120 +
      this.kills * 40 +
      timeBonus -
      this.deaths * 150 +
      (this.state === 'victory'
        ? this.config.id * 1000 + (this.bossWasHit ? 0 : 500)
        : 0);
    return Math.max(0, Math.round(raw));
  }

  private onBossDefeated() {
    this.state = 'victory';
    this.finalScore = this.computeScore();
    this.hostiles.clear(true, true);
    this.hud.hideBoss();
    this.player.body.setVelocity(0, 0);
    this.time.timeScale = 0.45;
    this.physics.world.timeScale = 2.2;
    this.cameras.main.zoomTo(RENDER_SCALE * 1.08, 1500);
    this.time.delayedCall(1300, () => {
      this.time.timeScale = 1;
      this.physics.world.timeScale = 1;
      this.playRestoration();
    });
  }

  private playRestoration() {
    const { config } = this;
    const info = peekColorInfo(config.accent, config.colorName);
    this.player.freeze();
    audio.sfx('win');
    this.cameras.main.flash(500, 255, 255, 255);
    this.cameras.main.zoomTo(RENDER_SCALE, 1200);
    this.cameras.main.stopFollow();

    const camera = this.cameras.main;
    const palette = info.palette.map((hex) =>
      Number.parseInt(hex.replace('#', ''), 16),
    );

    this.wipeFront = this.add
      .image(0, GAME_HEIGHT / 2, TEX.GLOW)
      .setScrollFactor(0)
      .setDepth(50)
      .setScale(1.1, 9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffffff);

    const reveal = { amount: 0 };
    const scaledWidth = this.bgGray.frame.realWidth * this.bgScale;
    this.tweens.add({
      duration: 3400,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.wipeFront?.destroy();
      },
      onUpdate: () => {
        this.setColorReveal(reveal.amount);
        const left = this.bgGray.x - scaledWidth / 2;
        this.wipeFront?.setX(left + scaledWidth * reveal.amount);
      },
      targets: reveal,
      amount: 1,
    });
    this.tweens.add({ alpha: 0.03, duration: 3400, targets: this.worldShade });

    // Chuva de cores da paleta devolvida pela TheColorAPI.
    for (let index = 0; index < 46; index++) {
      this.time.delayedCall(index * 70, () => {
        const color = palette[index % palette.length];
        this.effects.spark(
          camera.scrollX + Phaser.Math.Between(40, GAME_WIDTH - 40),
          Phaser.Math.Between(80, 480),
          color,
          6,
          220,
        );
      });
    }
    this.effects.ring(
      camera.scrollX + GAME_WIDTH / 2,
      300,
      config.accent,
      12,
      1600,
    );

    const title = this.add
      .text(GAME_WIDTH / 2, 190, 'COR RESTAURADA', textStyle(50))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setAlpha(0);
    const colorLine = this.add
      .text(
        GAME_WIDTH / 2,
        246,
        `${info.name}  ·  ${info.hex}`,
        textStyle(20, Phaser.Display.Color.IntegerToColor(config.accent).rgba),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setAlpha(0);
    this.tweens.add({
      alpha: 1,
      delay: 700,
      duration: 900,
      targets: [title, colorLine],
    });
    this.overlayObjects.push(title, colorLine);

    // Amostras da paleta.
    palette.forEach((color, index) => {
      const swatch = this.add
        .rectangle(
          GAME_WIDTH / 2 + (index - (palette.length - 1) / 2) * 56,
          292,
          44,
          44,
          color,
          1,
        )
        .setStrokeStyle(3, 0xffffff, 0.9)
        .setScrollFactor(0)
        .setDepth(120)
        .setAlpha(0)
        .setScale(0.4);
      this.tweens.add({
        alpha: 1,
        delay: 1100 + index * 130,
        duration: 420,
        ease: 'Back.Out',
        scale: 1,
        targets: swatch,
      });
      this.overlayObjects.push(swatch);
    });

    this.completeAndSave();
    this.time.delayedCall(5200, () => {
      this.showResults();
    });
  }

  private completeAndSave() {
    const score = this.finalScore;
    this.flushStats();
    const progress = ProgressApi.completePhase(this.config.id, {
      deaths: this.deaths,
      drops: this.dropsCollected,
      kills: this.kills,
      score,
      timeMs: this.elapsed,
    });
    const session = getSession();
    if (session) {
      void LeaderboardApi.submit(session, progress);
    }
  }

  private showResults() {
    for (const object of this.overlayObjects) object.destroy();
    this.overlayObjects = [];
    const { config } = this;
    const score = this.finalScore;
    const best = ProgressApi.get().bestScores[String(config.id)] ?? score;
    const isRecord = score >= best;
    const hex = Phaser.Display.Color.IntegerToColor(config.accent).rgba;

    const shade = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x040508,
        0.82,
      )
      .setScrollFactor(0)
      .setDepth(300);
    const panel = this.add
      .rectangle(GAME_WIDTH / 2, 300, 560, 470, 0x0e1016, 0.98)
      .setStrokeStyle(3, config.accent, 0.9)
      .setScrollFactor(0)
      .setDepth(301);
    const heading = this.add
      .text(
        GAME_WIDTH / 2,
        92,
        `FASE ${String(config.id)} CONCLUÍDA`,
        textStyle(30, hex),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(302);

    const seconds = Math.round(this.elapsed / 1000);
    const rows: [string, string][] = [
      [
        'Gotas de tinta',
        `${String(this.dropsCollected)} / ${String(this.dropCount)}`,
      ],
      ['Cristais', '3 / 3'],
      ['Inimigos vencidos', String(this.kills)],
      ['Vida restante', `${String(this.hp)} / ${String(MAX_HP)}`],
      [
        'Tempo',
        `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`,
      ],
      ['Derrotas', String(this.deaths)],
    ];
    const items: Phaser.GameObjects.GameObject[] = [shade, panel, heading];
    rows.forEach(([label, value], index) => {
      const y = 148 + index * 32;
      items.push(
        this.add
          .text(
            GAME_WIDTH / 2 - 220,
            y,
            label,
            textStyle(17, '#a9acb4', 'Georgia, serif', false),
          )
          .setScrollFactor(0)
          .setDepth(302),
        this.add
          .text(
            GAME_WIDTH / 2 + 220,
            y,
            value,
            textStyle(17, '#ffffff', 'monospace', false),
          )
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(302),
      );
    });
    items.push(
      this.add
        .text(
          GAME_WIDTH / 2,
          358,
          `${String(score)} PONTOS`,
          textStyle(34, '#ffffff'),
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(302),
      this.add
        .text(
          GAME_WIDTH / 2,
          392,
          isRecord ? 'NOVO RECORDE!' : `Recorde: ${String(best)}`,
          textStyle(15, isRecord ? '#ffe28a' : '#8f929a', 'monospace', false),
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(302),
    );

    const isLast = config.id >= PHASE_COUNT;
    const next = () => {
      audio.stopMusic();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        if (isLast) {
          this.scene.start(KEY.SCENE.ENDING);
        } else {
          this.scene.start(KEY.SCENE.GAME_PHASE, { phaseId: config.id + 1 });
        }
      });
    };
    items.push(
      createButton(
        this,
        GAME_WIDTH / 2,
        440,
        isLast
          ? 'VER FINAL DO JOGO'
          : `PRÓXIMA FASE (${String(config.id + 1)})`,
        next,
        { accent: config.accent, depth: 303 },
      ),
      createButton(
        this,
        GAME_WIDTH / 2 - 142,
        494,
        'REPETIR',
        () => {
          this.scene.restart({ phaseId: config.id });
        },
        { accent: 0xffffff, depth: 303, width: 134 },
      ),
      createButton(
        this,
        GAME_WIDTH / 2 + 142,
        494,
        'MAPA',
        () => {
          this.leaveToLobby();
        },
        { accent: 0xffffff, depth: 303, width: 134 },
      ),
    );
    this.input.keyboard?.once('keydown-ENTER', next);
  }
}
