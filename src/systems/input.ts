import Phaser from 'phaser';

/** Acoes do jogo: teclado, toque (botoes virtuais) e gamepad viram o mesmo estado. */
export type Action =
  | 'attack'
  | 'crouch'
  | 'dash'
  | 'jump'
  | 'left'
  | 'nova'
  | 'pause'
  | 'right'
  | 'shoot';

const ACTIONS: Action[] = [
  'left',
  'right',
  'jump',
  'crouch',
  'attack',
  'shoot',
  'dash',
  'nova',
  'pause',
];

const KEY_MAP: Record<Action, number[]> = {
  attack: [Phaser.Input.Keyboard.KeyCodes.J, Phaser.Input.Keyboard.KeyCodes.X],
  crouch: [
    Phaser.Input.Keyboard.KeyCodes.S,
    Phaser.Input.Keyboard.KeyCodes.DOWN,
  ],
  dash: [
    Phaser.Input.Keyboard.KeyCodes.SHIFT,
    Phaser.Input.Keyboard.KeyCodes.L,
  ],
  jump: [
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.W,
    Phaser.Input.Keyboard.KeyCodes.UP,
    Phaser.Input.Keyboard.KeyCodes.Z,
  ],
  left: [Phaser.Input.Keyboard.KeyCodes.A, Phaser.Input.Keyboard.KeyCodes.LEFT],
  nova: [Phaser.Input.Keyboard.KeyCodes.E, Phaser.Input.Keyboard.KeyCodes.V],
  pause: [Phaser.Input.Keyboard.KeyCodes.ESC, Phaser.Input.Keyboard.KeyCodes.P],
  right: [
    Phaser.Input.Keyboard.KeyCodes.D,
    Phaser.Input.Keyboard.KeyCodes.RIGHT,
  ],
  shoot: [Phaser.Input.Keyboard.KeyCodes.K, Phaser.Input.Keyboard.KeyCodes.C],
};

/** Botoes virtuais escrevem aqui; o GameInput le junto com o teclado. */
export const touchHeld: Record<Action, boolean> = {
  attack: false,
  crouch: false,
  dash: false,
  jump: false,
  left: false,
  nova: false,
  pause: false,
  right: false,
  shoot: false,
};

export interface InputState {
  /** Acao acabou de ser apertada neste quadro. */
  pressed: Record<Action, boolean>;
  held: Record<Action, boolean>;
  /** Acao acabou de ser solta neste quadro. */
  released: Record<Action, boolean>;
  moveX: number;
}

function blankRecord(): Record<Action, boolean> {
  return {
    attack: false,
    crouch: false,
    dash: false,
    jump: false,
    left: false,
    nova: false,
    pause: false,
    right: false,
    shoot: false,
  };
}

function blankFrameRecord(): Record<Action, number> {
  return {
    attack: 0,
    crouch: 0,
    dash: 0,
    jump: 0,
    left: 0,
    nova: 0,
    pause: 0,
    right: 0,
    shoot: 0,
  };
}

export class GameInput {
  readonly state: InputState = {
    held: blankRecord(),
    moveX: 0,
    pressed: blankRecord(),
    released: blankRecord(),
  };

  private keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private previous = blankRecord();
  private queued = blankRecord();
  private tapFrames = blankFrameRecord();

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard!;
    this.keys = {} as Record<Action, Phaser.Input.Keyboard.Key[]>;
    for (const action of ACTIONS) {
      this.keys[action] = KEY_MAP[action].map((code) => {
        // As capturas do Phaser sao globais. Nao bloqueie letras em campos HTML
        // depois que o jogador sair da fase (login, cadastro e busca de cidade).
        const key = keyboard.addKey(code, false);
        key.on('down', () => {
          this.queued[action] = true;
          if (action === 'left' || action === 'right') {
            this.tapFrames[action] = 4;
          }
        });
        return key;
      });
    }
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
    scene.input.addPointer(3);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const action of ACTIONS) {
        for (const key of this.keys[action]) {
          keyboard.removeKey(key, true);
        }
        touchHeld[action] = false;
      }
    });
  }

  /** Chamar uma vez por quadro, antes de qualquer leitura. */
  poll(): InputState {
    const pad = this.readGamepad();
    for (const action of ACTIONS) {
      const down =
        this.keys[action].some((key) => key.isDown) ||
        touchHeld[action] ||
        pad[action] ||
        this.tapFrames[action] > 0;
      this.state.held[action] = down;
      this.state.pressed[action] =
        (down && !this.previous[action]) || this.queued[action];
      this.state.released[action] = !down && this.previous[action];
      this.previous[action] = down;
      this.queued[action] = false;
      this.tapFrames[action] = Math.max(0, this.tapFrames[action] - 1);
    }
    this.state.moveX =
      Number(this.state.held.right) - Number(this.state.held.left);
    return this.state;
  }

  /** Solta tudo (usado ao pausar, para nao ficar com tecla "presa"). */
  reset() {
    const pad = this.readGamepad();
    for (const action of ACTIONS) {
      // Tecla ainda segurada nao pode virar uma "nova pressao" no proximo quadro.
      this.previous[action] =
        this.keys[action].some((key) => key.isDown) ||
        touchHeld[action] ||
        pad[action];
      this.state.held[action] = false;
      this.state.pressed[action] = false;
      this.state.released[action] = false;
      this.queued[action] = false;
      this.tapFrames[action] = 0;
    }
    this.state.moveX = 0;
  }

  private readGamepad(): Record<Action, boolean> {
    const result = blankRecord();
    const pads =
      typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : [];
    const pad = pads.find((candidate) => candidate?.connected);
    if (!pad) {
      return result;
    }
    const pressed = (index: number) => pad.buttons[index]?.pressed ?? false;
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    result.left = axisX < -0.4 || pressed(14);
    result.right = axisX > 0.4 || pressed(15);
    result.crouch = axisY > 0.6 || pressed(13);
    result.jump = pressed(0) || pressed(12);
    result.attack = pressed(2);
    result.shoot = pressed(1) || pressed(3);
    result.dash = pressed(5) || pressed(7);
    result.nova = pressed(4) || pressed(6);
    result.pause = pressed(9);
    return result;
  }
}
