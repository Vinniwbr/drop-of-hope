import Phaser from 'phaser';

import { GAME_WIDTH, HOPE, KEY, PHASE_COUNT } from '../constants';
import { configureHighResolutionCamera } from '../graphics/rendering';
import {
  AuthApi,
  getLocation,
  getSession,
  getWeather,
  LeaderboardApi,
  ProgressApi,
  refreshWeather,
  requestGeolocation,
  saveLocation,
  searchCity,
} from '../services';
import { audio } from '../systems/audio';
import { isTouchDevice } from '../systems/touch-controls';
import { el, openModal } from '../ui/dom';
import { textStyle } from '../ui/widgets';

const MENU_IDLE = 'MENU_HOPE_IDLE';

type MenuAction =
  'continue' | 'play' | 'account' | 'ranking' | 'controls' | 'settings';

const MENU_ITEMS: readonly {
  action: MenuAction;
  hint: string;
  label: string;
}[] = [
  { action: 'continue', hint: 'RETOMAR A JORNADA', label: 'CONTINUAR' },
  { action: 'play', hint: 'ESCOLHER UMA FASE', label: 'JOGAR' },
  { action: 'account', hint: 'PERFIL E PROGRESSO', label: 'CONTA' },
  { action: 'ranking', hint: 'MELHORES PONTUAÇÕES', label: 'RANKING' },
  { action: 'controls', hint: 'COMANDOS DO JOGO', label: 'CONTROLES' },
  { action: 'settings', hint: 'SOM E CLIMA', label: 'CONFIGURAÇÕES' },
];

interface MenuEntry {
  action: MenuAction;
  enabled: boolean;
  hint: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

export class Menu extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Sprite;
  private menuEntries: MenuEntry[] = [];
  private overlay?: Phaser.GameObjects.Container;
  private selectedIndex = 0;
  private selectionBar!: Phaser.GameObjects.Rectangle;
  private weatherText!: Phaser.GameObjects.Text;

  constructor() {
    super(KEY.SCENE.MENU);
  }

  create() {
    configureHighResolutionCamera(this);
    this.menuEntries = [];
    this.overlay = undefined;
    this.createAnimations();
    this.cameras.main.setBackgroundColor('#050505');
    this.createMonochromeBackdrop();

    this.add.text(54, 54, 'DROP OF', textStyle(54, '#f4f4f1')).setDepth(20);
    this.add.text(54, 112, 'HOPE', textStyle(54, '#f4f4f1')).setDepth(20);

    this.avatar = this.add
      .sprite(526, 535, KEY.SPRITESHEET.PLAYER_IDLE, 0)
      .setOrigin(
        HOPE.ANCHOR_X / HOPE.FRAME_WIDTH,
        HOPE.ANCHOR_Y / HOPE.FRAME_HEIGHT,
      )
      .setScale(1.18)
      .setDepth(21)
      .play(MENU_IDLE);
    this.tweens.add({
      alpha: { from: 0.86, to: 1 },
      duration: 1700,
      ease: 'Sine.InOut',
      repeat: -1,
      targets: this.avatar,
      yoyo: true,
    });

    this.createMenuList();

    this.createTopRight();
    this.createBottomBar();

    const keyboard = this.input.keyboard;
    for (const key of ['UP', 'W']) {
      keyboard?.on(`keydown-${key}`, () => {
        if (!this.overlay) this.moveSelection(-1);
      });
    }
    for (const key of ['DOWN', 'S']) {
      keyboard?.on(`keydown-${key}`, () => {
        if (!this.overlay) this.moveSelection(1);
      });
    }
    keyboard?.on('keydown-ENTER', () => {
      if (!this.overlay) this.activateItem(this.selectedIndex);
    });
    keyboard?.on('keydown-SPACE', () => {
      if (!this.overlay) this.activateItem(this.selectedIndex);
    });
    keyboard?.on('keydown-ESC', () => {
      this.closeOverlay();
    });

    // Navegadores so liberam audio depois de um toque/tecla do jogador.
    const startAudio = () => {
      audio.unlock();
      audio.playMusic('menu', 110);
    };
    audio.unlock();
    audio.playMusic('menu', 110);
    this.input.once('pointerdown', startAudio);
    keyboard?.once('keydown', startAudio);

    const hasProgress = ProgressApi.get().completedPhases.length > 0;
    this.selectItem(hasProgress ? 0 : 1);
    this.cameras.main.fadeIn(500, 0, 0, 0);
    void refreshWeather().then(() => {
      if (this.weatherText.active) this.updateWeatherText();
    });
  }

  private createMonochromeBackdrop() {
    this.add.rectangle(600, 300, 1200, 600, 0x050505).setDepth(0);
    this.add.rectangle(520, 300, 320, 600, 0xe9e9e4).setDepth(1);
    this.add.rectangle(360, 300, 2, 600, 0xffffff, 0.7).setDepth(2);
    this.add.rectangle(680, 300, 2, 600, 0xffffff, 0.7).setDepth(2);
    this.add.rectangle(600, 574, 1200, 52, 0x050505, 0.96).setDepth(5);
  }

  // ------------------------------------------------------------ elementos fixos

  private createTopRight() {
    const session = getSession();
    const name = session?.username ?? 'Viajante';
    const tag = session?.playerId ?? '';
    const profile = this.add
      .text(735, 28, name.toUpperCase(), textStyle(14, '#f3f1ec', 'monospace'))
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    profile.on('pointerdown', () => {
      this.openProfile();
    });
    this.add
      .text(
        735,
        51,
        session?.mode === 'user'
          ? `${tag}  ·  CONTA ONLINE`
          : `${tag}  ·  CONVIDADO`,
        textStyle(10, '#9ea1a8', 'monospace'),
      )
      .setDepth(30);
  }

  private createBottomBar() {
    this.weatherText = this.add
      .text(GAME_WIDTH - 28, 564, '', textStyle(10, '#a8abb2', 'monospace'))
      .setOrigin(1, 0)
      .setDepth(22)
      .setInteractive({ useHandCursor: true });
    this.weatherText.on('pointerdown', () => {
      this.openWeather();
    });
    this.updateWeatherText();
  }

  private updateWeatherText() {
    const weather = getWeather();
    this.weatherText.setText(
      weather.live
        ? `CLIMA REAL  ·  ${weather.city} ${String(weather.temperature)}°C ${weather.label.toUpperCase()}  ·  ALTERAR`
        : 'CLIMA: OFFLINE  ·  TOQUE PARA ESCOLHER A CIDADE',
    );
  }

  // --------------------------------------------------------------- menu

  private createMenuList() {
    const progress = ProgressApi.get();
    const hasProgress = progress.completedPhases.length > 0;
    this.add
      .text(735, 102, 'MENU PRINCIPAL', textStyle(11, '#888888', 'monospace'))
      .setDepth(20);
    this.selectionBar = this.add
      .rectangle(960, 153, 430, 48, 0xffffff, 0.08)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.72)
      .setDepth(10);

    MENU_ITEMS.forEach((item, index) => {
      const y = 153 + index * 66;
      const enabled = item.action !== 'continue' || hasProgress;
      const label = this.add
        .text(760, y - 18, item.label, textStyle(21, '#d9d9d6'))
        .setDepth(20);
      const hint = this.add
        .text(
          762,
          y + 18,
          enabled ? item.hint : 'NENHUMA FASE INICIADA',
          textStyle(9, '#777775', 'monospace'),
        )
        .setDepth(20);
      const zone = this.add
        .zone(960, y, 430, 54)
        .setInteractive({ useHandCursor: enabled });
      if (enabled) {
        zone.on('pointerover', () => {
          this.selectItem(index);
        });
        zone.on('pointerdown', () => {
          audio.unlock();
          this.activateItem(index);
        });
      }
      this.menuEntries.push({
        action: item.action,
        enabled,
        hint,
        label,
        zone,
      });
    });
    this.add
      .text(
        735,
        546,
        'W / S  NAVEGAR    ENTER  SELECIONAR',
        textStyle(9, '#686866', 'monospace'),
      )
      .setDepth(20);
  }

  private createAnimations() {
    if (!this.anims.exists(MENU_IDLE)) {
      this.anims.create({
        frameRate: 7,
        frames: this.anims.generateFrameNumbers(KEY.SPRITESHEET.PLAYER_IDLE, {
          end: 7,
          start: 0,
        }),
        key: MENU_IDLE,
        repeat: -1,
      });
    }
  }

  private moveSelection(direction: number) {
    let nextIndex = this.selectedIndex;
    do {
      nextIndex = Phaser.Math.Wrap(
        nextIndex + direction,
        0,
        this.menuEntries.length,
      );
    } while (!this.menuEntries[nextIndex].enabled);
    this.selectItem(nextIndex);
  }

  private selectItem(index: number) {
    if (!this.menuEntries[index]?.enabled) return;
    this.selectedIndex = index;
    this.menuEntries.forEach((entry, entryIndex) => {
      const selected = entryIndex === index;
      entry.label
        .setColor(!entry.enabled ? '#4f4f4d' : selected ? '#ffffff' : '#bdbdb9')
        .setX(selected ? 774 : 760);
      entry.hint.setColor(
        !entry.enabled ? '#464644' : selected ? '#deded9' : '#727270',
      );
    });
    this.selectionBar.setY(153 + index * 66);
  }

  private activateItem(index: number) {
    const entry = this.menuEntries[index];
    if (!entry.enabled) return;
    this.selectItem(index);
    audio.sfx('click');
    if (entry.action === 'continue') {
      const phaseId = Math.min(
        PHASE_COUNT,
        ProgressApi.get().completedPhases.length + 1,
      );
      this.startScene(KEY.SCENE.GAME_PHASE, { phaseId });
    } else if (entry.action === 'play') {
      this.startScene(KEY.SCENE.LOBBY);
    } else if (entry.action === 'account') {
      this.openProfile();
    } else if (entry.action === 'ranking') {
      void this.showRanking();
    } else if (entry.action === 'controls') {
      this.showControls();
    } else {
      this.showSettings();
    }
  }

  private startScene(scene: string, data?: object) {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(scene, data);
    });
  }

  // ------------------------------------------------------------ painéis Phaser

  private createOverlay(title: string) {
    this.closeOverlay();
    const shade = this.add
      .rectangle(600, 300, 1200, 600, 0x050608, 0.78)
      .setInteractive();
    const panel = this.add
      .rectangle(600, 300, 680, 450, 0x0b0b0b, 0.98)
      .setStrokeStyle(2, 0xffffff, 0.72);
    const heading = this.add
      .text(600, 112, title, textStyle(31))
      .setOrigin(0.5);
    const close = this.add
      .text(600, 508, 'VOLTAR', textStyle(17, '#c8cad0', 'monospace', false))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.closeOverlay();
    });
    this.overlay = this.add
      .container(0, 0, [shade, panel, heading, close])
      .setDepth(200);
    return this.overlay;
  }

  private showSettings() {
    const overlay = this.createOverlay('CONFIGURAÇÕES');
    const soundLabel = this.add.text(
      350,
      205,
      'SOM',
      textStyle(15, '#aeb1b8', 'monospace', false),
    );
    const soundValue = this.add
      .text(
        850,
        205,
        audio.isMuted ? 'DESLIGADO' : 'LIGADO',
        textStyle(15, '#f0f0ed', 'monospace', false),
      )
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    const weather = getWeather();
    const weatherLabel = this.add.text(
      350,
      285,
      'CLIMA DINÂMICO',
      textStyle(15, '#aeb1b8', 'monospace', false),
    );
    const weatherValue = this.add
      .text(
        850,
        285,
        weather.live ? weather.city.toUpperCase() : 'CONFIGURAR',
        textStyle(15, '#f0f0ed', 'monospace', false),
      )
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    const soundLine = this.add.rectangle(600, 245, 500, 1, 0xffffff, 0.12);
    const weatherLine = this.add.rectangle(600, 325, 500, 1, 0xffffff, 0.12);
    const note = this.add
      .text(
        600,
        382,
        'O clima real altera a atmosfera das fases.',
        textStyle(13, '#8f9299', 'Georgia, serif', false),
      )
      .setOrigin(0.5);
    soundValue.on('pointerdown', () => {
      audio.unlock();
      const muted = audio.toggleMute();
      soundValue.setText(muted ? 'DESLIGADO' : 'LIGADO');
    });
    weatherValue.on('pointerdown', () => {
      this.closeOverlay();
      this.openWeather();
    });
    overlay.add([
      soundLabel,
      soundValue,
      weatherLabel,
      weatherValue,
      soundLine,
      weatherLine,
      note,
    ]);
  }

  private showControls() {
    const overlay = this.createOverlay('CONTROLES');
    const rows: [string, string][] = [
      ['MOVER', 'A / D  ou  SETAS'],
      ['PULAR', 'ESPAÇO / W / SETA PARA CIMA'],
      ['AGACHAR', 'S / SETA PARA BAIXO'],
      ['PINCEL (CORPO A CORPO)', 'J / X'],
      ['DISPARAR TINTA', 'K / C'],
      ['DASH (ESQUIVA)', 'SHIFT / L'],
      ['NOVA DE TINTA (BARRA CHEIA)', 'E / V'],
      ['PAUSAR', 'ESC / P'],
    ];
    rows.forEach(([action, key], index) => {
      overlay.add(
        this.add.text(
          330,
          168 + index * 36,
          action,
          textStyle(13, '#8f929a', 'monospace', false),
        ),
      );
      overlay.add(
        this.add.text(
          650,
          168 + index * 36,
          key,
          textStyle(13, '#ffffff', 'monospace', false),
        ),
      );
    });
    overlay.add(
      this.add
        .text(
          600,
          466,
          isTouchDevice()
            ? 'No celular, use os botões na tela.'
            : 'Dica: pise na cabeça dos inimigos e corte os orbes com o pincel.',
          textStyle(12, '#b9bcc4', 'Georgia, serif', false),
        )
        .setOrigin(0.5),
    );
  }

  private async showRanking() {
    const overlay = this.createOverlay('RANKING');
    const loading = this.add
      .text(
        600,
        300,
        'CARREGANDO...',
        textStyle(15, '#aeb0b6', 'monospace', false),
      )
      .setOrigin(0.5);
    overlay.add(loading);
    const entries = await LeaderboardApi.list(getSession());
    if (!this.overlay || !loading.active) {
      return;
    }
    loading.destroy();
    if (entries.length === 0) {
      overlay.add(
        this.add
          .text(
            600,
            300,
            'Conclua uma fase para entrar no ranking.',
            textStyle(18, '#bfc1c7', 'Georgia, serif', false),
          )
          .setOrigin(0.5),
      );
      return;
    }
    entries.slice(0, 8).forEach((entry, index) => {
      const y = 168 + index * 40;
      const color = entry.isYou ? '#ffe28a' : '#f1f1f3';
      overlay.add(
        this.add.text(
          290,
          y,
          `${String(index + 1).padStart(2, '0')}  ${entry.username}`,
          textStyle(17, color, 'monospace', false),
        ),
      );
      overlay.add(
        this.add.text(
          560,
          y + 2,
          entry.playerId,
          textStyle(11, '#7d8088', 'monospace', false),
        ),
      );
      overlay.add(
        this.add
          .text(
            910,
            y,
            `${String(entry.totalScore)}  ·  ${String(entry.phases)}/${String(PHASE_COUNT)}`,
            textStyle(17, color, 'monospace', false),
          )
          .setOrigin(1, 0),
      );
    });
    overlay.add(
      this.add
        .text(
          600,
          486,
          getSession()?.mode === 'user'
            ? 'Ranking mundial (Firebase)'
            : 'Convidados podem consultar, mas apenas contas entram no ranking.',
          textStyle(11, '#7d8088', 'monospace', false),
        )
        .setOrigin(0.5),
    );
  }

  private closeOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  // ------------------------------------------------------------ janelas HTML

  private openProfile() {
    audio.sfx('click');
    const session = getSession();
    const progress = ProgressApi.get();
    const modal = openModal('Perfil do jogador');
    const minutes = Math.round(progress.stats.playMs / 60000);
    const lines: [string, string][] = [
      ['Nome', session?.username ?? '-'],
      ['ID', session?.playerId ?? '-'],
      [
        'Conta',
        session?.mode === 'user'
          ? 'Online (Firebase)'
          : 'Convidado (neste aparelho)',
      ],
      [
        'Fases concluídas',
        `${String(progress.completedPhases.length)} / ${String(PHASE_COUNT)}`,
      ],
      ['Pontuação total', String(progress.totalScore)],
      ['Gotas coletadas', String(progress.stats.drops)],
      ['Inimigos vencidos', String(progress.stats.kills)],
      ['Derrotas', String(progress.stats.deaths)],
      ['Tempo jogado', `${String(minutes)} min`],
    ];
    const list = el('dl', 'doh-stats');
    for (const [label, value] of lines) {
      list.append(el('dt', '', label), el('dd', '', value));
    }
    modal.body.append(list);
    const logout = el(
      'button',
      'doh-btn primary',
      session?.mode === 'user' ? 'Sair da conta' : 'Trocar de jogador',
    );
    logout.type = 'button';
    logout.addEventListener('click', () => {
      modal.close();
      void AuthApi.logout().then(() => {
        audio.stopMusic();
        this.scene.start(KEY.SCENE.AUTH);
      });
    });
    modal.body.append(logout);
  }

  private openWeather() {
    audio.sfx('click');
    const keyboard = this.input.keyboard;
    if (keyboard) keyboard.enabled = false;
    const modal = openModal('Clima do jogo', () => {
      if (keyboard) keyboard.enabled = true;
    });
    const location = getLocation();
    modal.body.append(
      el(
        'p',
        'doh-hint',
        'O jogo usa o clima real (API Open-Meteo): chuva, neve, neblina, tempestade e noite aparecem dentro das fases.',
      ),
    );
    const label = el('label', 'doh-label', 'Cidade');
    const input = el('input', 'doh-input');
    input.value = location.city === 'Minha localização' ? '' : location.city;
    input.placeholder = 'Ex.: Recife';
    label.append(input);
    const message = el('p', 'doh-message');
    const search = el('button', 'doh-btn primary', 'Buscar cidade');
    search.type = 'button';
    const locate = el('button', 'doh-btn ghost', 'Usar minha localização');
    locate.type = 'button';
    modal.body.append(label, message, search, locate);

    const apply = async (found: Awaited<ReturnType<typeof searchCity>>) => {
      if (!found) {
        message.textContent = 'Não encontrei. Confira o nome ou sua conexão.';
        return;
      }
      saveLocation(found);
      const weather = await refreshWeather();
      this.updateWeatherText();
      message.textContent = weather.live
        ? `${found.city}: ${String(weather.temperature)}°C, ${weather.label}`
        : 'Cidade salva, mas o clima não pôde ser carregado agora.';
    };
    search.addEventListener('click', () => {
      message.textContent = 'Buscando...';
      void searchCity(input.value).then(apply);
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') search.click();
    });
    locate.addEventListener('click', () => {
      message.textContent = 'Aguardando permissão do navegador...';
      void requestGeolocation().then((found) => {
        if (!found) message.textContent = 'Localização não autorizada.';
        else return apply(found);
      });
    });
  }
}
