# Drop of Hope

Jogo de plataforma e chefes para navegador, no estilo *Mario* e *Cuphead* com atmosfera
de *Hollow Knight*. O mundo foi roubado de suas cores. Você é **Hope**, uma sombra com
pincel: atravesse cinco fases, colete gotas de tinta, derrote um chefe em cada uma e
veja o mapa voltar a ter cor.

Feito com **Phaser 4 + TypeScript + Vite**, publicado no **GitHub Pages**, com
**Firebase** (contas, progresso e ranking) e **duas APIs externas** (cores e clima).

## Como funciona

1. **Entre** com nome de usuário e senha (ganha um **ID único**, ex. `DOH-7K2M9Q`) ou jogue como convidado.
2. No **mapa**, escolha a fase (uma libera a próxima).
3. Atravesse o percurso: pule vãos, desvie de espinhos e armadilhas, pise ou corte os inimigos.
4. Colete **gotas de tinta** (pontos + barra de *Nova*) e os **3 cristais de cor** que abrem o portão do chefe.
5. Derrote o chefe em 3 fases de luta. O cenário **ganha cor** e você recebe a paleta da cor devolvida.

### Controles

| Ação | Teclado | Celular |
| --- | --- | --- |
| Mover | `A` `D` ou setas | botões `<` `>` |
| Pular (segure = mais alto) | `Espaço` `W` `↑` | `PULO` |
| Agachar | `S` `↓` | `v` |
| Pincel (corpo a corpo) | `J` `X` | `PINCEL` |
| Disparar tinta | `K` `C` | `TINTA` |
| Dash (esquiva com invulnerabilidade) | `Shift` `L` | `DASH` |
| Nova de tinta (barra cheia) | `E` `V` | `NOVA` |
| Pausar | `Esc` `P` | `II` |

Dicas: pisar na cabeça de inimigos comuns os derrota; o pincel **destrói orbes** e recarrega tinta;
o dash atravessa ataques sem dano; wall jump nas paredes.

## As duas APIs externas

Ambas são gratuitas, sem chave e com CORS liberado (funcionam direto no GitHub Pages).
Se estiverem fora do ar, o jogo continua normalmente.

| API | Uso no jogo | Código |
| --- | --- | --- |
| [TheColorAPI](https://www.thecolorapi.com) | Cada chefe rouba uma cor. Ao vencer, o jogo consulta o **nome oficial** da cor e uma **paleta harmônica** de 5 tons, usados na chuva de cores, nas amostras da vitória e no mapa | [`src/services/color-api.ts`](src/services/color-api.ts) |
| [Open-Meteo](https://open-meteo.com) | **Clima real** da cidade do jogador (busca por nome ou geolocalização) vira clima dentro das fases: chuva, neve, neblina, tempestade com relâmpagos e noite | [`src/services/weather-api.ts`](src/services/weather-api.ts) |

## Firebase

- **Authentication** (e-mail/senha): o nome de usuário vira um e-mail interno; nenhuma senha passa pelo nosso código.
- **Firestore**: `players/{uid}` (perfil e progresso, privado) e `leaderboard/{uid}` (ranking público).
- Sem configuração o jogo roda em **modo convidado** (progresso no aparelho).

Passo a passo: [docs/FIREBASE.md](docs/FIREBASE.md). Regras de segurança: [firestore.rules](firestore.rules).

## Rodar no computador

```sh
npm install
npm start
```

Abre em <http://localhost:5173>. Em modo de desenvolvimento há atalhos de teste:
`F9` (vai até o portão do chefe) e `F10` (derrota o chefe).

| Comando | O que faz |
| --- | --- |
| `npm start` | servidor de desenvolvimento |
| `npm run build` | gera a versão final em `dist/` |
| `npm run preview` | serve o build local |
| `npm run lint` / `lint:tsc` | ESLint / checagem de tipos |
| `npm run sprites` | refaz as folhas do personagem a partir de `art/source/player` |
| `npm run assets` | converte fundos e chefes de `art/source` para WebP em `public/` |

## Publicar

Guia: [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md). Resumo: criar o repositório no GitHub,
`git remote set-url origin ...`, `git push`, e escolher **GitHub Actions** em *Settings → Pages*.

## Estrutura

```
src/
├── scenes/       Boot, Auth (login), Menu, Lobby (mapa), GamePhase (fase + chefe), Ending
├── sprites/      Player, Enemy (5 tipos), Boss (5 chefes com padrões de ataque)
├── data/         phases.ts: as 5 fases (chão, plataformas, inimigos, gotas, cristais)
├── services/     Firebase, contas, progresso, ranking, color-api, weather-api
├── systems/      áudio procedural, entrada unificada (teclado/toque/gamepad), controles de toque
├── graphics/     texturas geradas por código, arte das plataformas, efeitos, clima
├── ui/           HUD, botões, janelas HTML
art/source/       artes originais (fundos, chefes, folhas do personagem)
scripts/          build-sprites.mjs, optimize-assets.mjs
docs/             FIREBASE.md, GITHUB_PAGES.md, game-vision.md
```

## Créditos e licença

- Arte do personagem, cenários e chefes: material do projeto (`art/source`).
- Áudio: gerado por código (Web Audio), sem arquivos de terceiros.
- Base técnica derivada de [remarkablegames/phaser-platformer](https://github.com/remarkablegames/phaser-platformer) (MIT). O `LICENSE` original foi preservado.
