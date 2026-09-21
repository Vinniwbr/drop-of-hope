import type Phaser from 'phaser';

/**
 * Ferramentas de teste (SO em `npm start`; nao entram no build de producao).
 *
 * Com o navegador em segundo plano o requestAnimationFrame cai para ~2 fps,
 * entao os testes avancam o jogo "na mao" com `__pump` e simulam teclas com `__key`.
 */
export function installDevTools(game: Phaser.Game) {
  const errors: string[] = [];
  window.addEventListener('error', (event) => {
    errors.push(
      `${event.message} @${event.filename.split('/').pop() ?? ''}:${String(event.lineno)}`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    errors.push(`rejeicao: ${String(event.reason)}`);
  });

  const tools = {
    __errors: errors,
    __game: game,
    /** Cena de fase atual (ou undefined). */
    __gp: () => game.scene.getScene('GAME_PHASE'),
    __KC: {
      attack: 74,
      dash: 16,
      down: 83,
      jump: 87,
      left: 65,
      nova: 69,
      pause: 27,
      right: 68,
      shoot: 75,
    },
    __key: (keyCode: number, down: boolean) => {
      window.dispatchEvent(
        new KeyboardEvent(down ? 'keydown' : 'keyup', {
          bubbles: true,
          keyCode,
          which: keyCode,
        }),
      );
    },
    /** Avanca N quadros do jogo, sem depender do requestAnimationFrame. */
    __pump: async (frames = 60, delta = 16.67) => {
      for (let index = 0; index < frames; index++) {
        game.step(performance.now(), delta);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    __scene: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    /** Espera o Boot terminar e devolve a cena ativa. */
    __ready: async () => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (game.scene.getScenes(true)[0]?.scene.key !== 'BOOT') break;
        await tools.__pump(20);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await tools.__pump(10);
      return tools.__scene();
    },
    /** Vai direto para uma fase. */
    __start: async (phaseId: number) => {
      for (const scene of game.scene.getScenes(true)) {
        game.scene.stop(scene.scene.key);
      }
      game.scene.start('GAME_PHASE', { phaseId });
      await tools.__pump(150);
      return tools.__gp();
    },
  };
  Object.assign(window, tools);
  window.addEventListener('keydown', (event) => {
    const phase = Number(event.code.replace('Numpad', ''));
    if (event.code.startsWith('Numpad') && phase >= 1 && phase <= 5) {
      void tools.__start(phase);
    }
  });
}
