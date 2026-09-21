import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, KEY } from '../constants';
import { configureHighResolutionCamera } from '../graphics/rendering';
import {
  AuthApi,
  AuthError,
  getSession,
  isFirebaseConfigured,
  type Session,
} from '../services';
import { audio } from '../systems/audio';
import { el } from '../ui/dom';
import { readStorage, writeStorage } from '../utils';

type Mode = 'guest' | 'login' | 'register';

const LAST_USER_KEY = 'drop-off-hope:last-username:v1';

/**
 * Tela de entrada: criar conta, entrar ou jogar como convidado.
 * Usa um formulario HTML por cima do canvas (teclado de celular, gerenciador
 * de senhas e acessibilidade funcionam melhor do que com texto do Phaser).
 */
export class Auth extends Phaser.Scene {
  private root?: HTMLElement;

  constructor() {
    super(KEY.SCENE.AUTH);
  }

  create() {
    configureHighResolutionCamera(this);
    this.cameras.main.setBackgroundColor('#0b0c10');
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, KEY.IMAGE.MAIN_LOBBY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setTint(0x8d8f9a);
    this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x05060a,
      0.55,
    );
    if (this.input.keyboard) {
      // O formulario precisa receber todas as teclas (inclusive espaco).
      this.input.keyboard.enabled = false;
    }
    this.mount(isFirebaseConfigured ? 'login' : 'guest');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.root?.remove();
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });
  }

  private mount(initial: Mode) {
    this.root?.remove();
    const root = el('div', 'doh-overlay');
    const card = el('form', 'doh-card auth');
    card.noValidate = true;
    root.append(card);
    this.root = root;

    card.append(
      el('h1', 'doh-logo', 'DROP OF HOPE'),
      el('p', 'doh-sub', 'Devolva as cores ao mundo'),
    );

    const tabs = el('div', 'doh-tabs');
    const tabButtons = new Map<Mode, HTMLButtonElement>();
    const labels: [Mode, string][] = [
      ['login', 'Entrar'],
      ['register', 'Criar conta'],
      ['guest', 'Convidado'],
    ];
    for (const [mode, label] of labels) {
      const button = el('button', 'doh-tab', label);
      button.type = 'button';
      tabButtons.set(mode, button);
      tabs.append(button);
    }
    card.append(tabs);

    const notice = el('p', 'doh-notice');
    const nameLabel = el('label', 'doh-label', 'Nome de usuário');
    const nameInput = el('input', 'doh-input');
    nameInput.maxLength = 16;
    nameInput.autocomplete = 'username';
    nameInput.autocapitalize = 'off';
    nameInput.spellcheck = false;
    nameInput.value = readStorage(LAST_USER_KEY) ?? '';
    nameLabel.append(nameInput);

    const passLabel = el('label', 'doh-label', 'Senha');
    const passInput = el('input', 'doh-input');
    passInput.type = 'password';
    passInput.maxLength = 64;
    passLabel.append(passInput);

    const confirmLabel = el('label', 'doh-label', 'Repita a senha');
    const confirmInput = el('input', 'doh-input');
    confirmInput.type = 'password';
    confirmInput.maxLength = 64;
    confirmInput.autocomplete = 'new-password';
    confirmLabel.append(confirmInput);

    const message = el('p', 'doh-message');
    message.setAttribute('role', 'alert');
    const submit = el('button', 'doh-btn primary', 'Entrar');
    submit.type = 'submit';
    const hint = el('p', 'doh-hint');

    card.append(
      notice,
      nameLabel,
      passLabel,
      confirmLabel,
      message,
      submit,
      hint,
    );

    let mode: Mode = initial;
    const apply = (next: Mode) => {
      mode = next;
      message.textContent = '';
      for (const [key, button] of tabButtons) {
        button.classList.toggle('active', key === mode);
      }
      const online = mode !== 'guest';
      passLabel.style.display = online ? '' : 'none';
      confirmLabel.style.display = mode === 'register' ? '' : 'none';
      nameLabel.firstChild!.textContent = online
        ? 'Nome de usuário'
        : 'Seu apelido';
      passInput.autocomplete =
        mode === 'register' ? 'new-password' : 'current-password';
      submit.textContent =
        mode === 'login'
          ? 'Entrar'
          : mode === 'register'
            ? 'Criar conta e jogar'
            : 'Jogar como convidado';
      notice.textContent =
        online && !isFirebaseConfigured
          ? 'Contas online ainda não foram configuradas neste servidor. Use o modo convidado.'
          : '';
      notice.style.display = notice.textContent ? '' : 'none';
      submit.disabled = online && !isFirebaseConfigured;
      hint.textContent =
        mode === 'register'
          ? 'Ao criar a conta você recebe um ID único. Seu progresso fica salvo na nuvem.'
          : mode === 'guest'
            ? 'Convidado salva o progresso só neste aparelho. Você pode criar uma conta depois sem perder nada.'
            : 'Entre com o nome e a senha que você criou.';
    };
    for (const [key, button] of tabButtons) {
      button.addEventListener('click', () => {
        audio.unlock();
        apply(key);
      });
    }

    card.addEventListener('submit', (event) => {
      event.preventDefault();
      audio.unlock();
      void this.submit(
        mode,
        nameInput.value.trim(),
        passInput.value,
        confirmInput.value,
        message,
        submit,
      );
    });

    document.body.append(root);
    apply(initial);
    window.setTimeout(() => {
      (nameInput.value ? passInput : nameInput).focus();
    }, 50);
  }

  private async submit(
    mode: Mode,
    username: string,
    password: string,
    confirmation: string,
    message: HTMLElement,
    submit: HTMLButtonElement,
  ) {
    message.textContent = '';
    if (mode === 'register' && password !== confirmation) {
      message.textContent = 'As senhas não são iguais.';
      return;
    }
    submit.disabled = true;
    const previous = submit.textContent;
    submit.textContent = 'Aguarde...';
    try {
      let session: Session;
      if (mode === 'guest') {
        session = await AuthApi.playAsGuest(username);
      } else if (mode === 'register') {
        session = await AuthApi.register(username, password);
        writeStorage(LAST_USER_KEY, username);
        this.showWelcome(session);
        return;
      } else {
        session = await AuthApi.login(username, password);
        writeStorage(LAST_USER_KEY, username);
      }
      this.enterGame();
    } catch (error) {
      message.textContent =
        error instanceof AuthError
          ? error.message
          : 'Algo deu errado. Tente novamente.';
      submit.disabled = false;
      submit.textContent = previous;
    }
  }

  /** Depois de criar a conta, mostra o ID gerado para o jogador anotar. */
  private showWelcome(session: Session) {
    const card = this.root?.querySelector('.doh-card');
    if (!card) return;
    card.replaceChildren(
      el('h1', 'doh-logo', 'CONTA CRIADA'),
      el('p', 'doh-sub', `Bem-vindo, ${session.username}!`),
      el('p', 'doh-label', 'Seu ID de jogador'),
      el('p', 'doh-id', session.playerId),
      el(
        'p',
        'doh-hint',
        'Anote este ID: ele identifica você no ranking. Para voltar depois, entre com seu nome de usuário e senha.',
      ),
    );
    const go = el('button', 'doh-btn primary', 'Começar a jogar');
    go.type = 'button';
    go.addEventListener('click', () => {
      this.enterGame();
    });
    card.append(go);
    go.focus();
  }

  private enterGame() {
    if (!getSession()) return;
    this.root?.remove();
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(KEY.SCENE.MENU);
    });
  }
}
