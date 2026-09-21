---
name: dev_agent
description: Desenvolvedor do jogo de plataforma Drop of Hope (Phaser 4 + TypeScript)
---

## Stack

- Phaser 4, TypeScript 6 (strict, `erasableSyntaxOnly`: sem *parameter properties*), Vite 8, Node 24
- Firebase (Auth + Firestore), TheColorAPI, Open-Meteo
- Áudio procedural (Web Audio), texturas de inimigos/efeitos geradas por código

## Comandos

| Comando | Descrição |
| --- | --- |
| `npm start` | servidor de desenvolvimento (http://localhost:5173) |
| `npm run build` | build de produção em `dist/` |
| `npm run lint` / `npm run lint:tsc` | ESLint (estrito) / checagem de tipos |
| `npm run sprites` | reconstrói `public/sprites/hope/*.png` a partir de `art/source/player` |
| `npm run assets` | converte `art/source/{backgrounds,bosses}` para WebP em `public/` |

## Convenções

- Funções camelCase, classes PascalCase, constantes UPPER_SNAKE_CASE.
- Prettier + ESLint (ordenação de imports). Em template strings, números precisam de `String(n)`.
- Carregar assets somente em `src/scenes/Boot.ts`.
- Nunca use `console.*` (regra `no-console`).
- Ao adicionar um corpo físico a um `Group`, reaplique tamanho/gravidade **depois** de `group.add` (o grupo restaura os padrões). Ver `Enemy.setupBody`.
- Efeito "flash branco" no Phaser 4: `setTint(cor).setTintMode(Phaser.TintModes.FILL)` (`setTintFill` não existe mais).

## Estrutura

```
src/
├── constants/   chaves de assets e medidas do mundo (HOPE = medidas da folha do personagem)
├── data/        phases.ts (5 fases)
├── scenes/      Boot, Auth, Menu, Lobby, GamePhase, Ending
├── sprites/     Player, Enemy, Boss
├── services/    firebase, auth-api, progress-api, leaderboard-api, color-api, weather-api, session
├── systems/     audio, input (teclado+toque+gamepad), touch-controls
├── graphics/    textures, level-art, effects, weather-fx
├── ui/          Hud, widgets, dom (janelas HTML)
└── main.ts
```

## Testar sem jogar à mão

Em `npm start` o jogo expõe `window.__game`. Com o painel oculto o navegador limita a ~2 fps;
avance o jogo com `game.step(performance.now(), 16.67)` em laço e simule teclas com
`window.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 68}))`.
Atalhos de dev na fase: `F9` (portão do chefe) e `F10` (derrota o chefe).

## Regras de negócio importantes

- Física medida: pulo ≈ 139 px de altura, alcance correndo ≈ 285 px, com dash no ar ≈ 365 px.
  Vãos e degraus das fases em `data/phases.ts` respeitam isso.
- `firestore.rules` e `services/*` andam juntos: mudou um campo salvo, atualize as regras.
