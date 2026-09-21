# Drop of Hope — visão do jogo

## Ideia

Um mundo inteiro foi drenado de cor por cinco chefes. Hope, uma sombra armada com um pincel,
percorre cinco fases coletando **gotas de tinta** e devolve cada cor derrotando o chefe que a roubou.
O jogo mistura a leitura clara de *Mario* (pisar, pular, gaps), o desafio de chefes de *Cuphead*
(padrões com aviso, fases da luta) e a atmosfera sombria/melancólica de *Hollow Knight*.

## Estrutura de uma fase

1. Mapa de seleção; cada fase libera a próxima.
2. Cenário em preto e branco. Percurso lateral com plataformas, abismos, espinhos, inimigos.
3. **Checkpoints** (lanternas) e **3 cristais de cor** espalhados; os cristais abrem o portão do chefe.
4. **Chefe** em arena fechada, com 3 fases de luta (100% → 67% → 34%).
5. Vitória: câmera lenta, brilho, o cenário **ganha cor** (frente luminosa da esquerda para a direita)
   e a paleta da cor devolvida (TheColorAPI) aparece. Placar, recorde e envio ao ranking.

## Fases e chefes

| # | Fase | Cor roubada | Mecânica nova | Chefe | Estilo de luta |
| - | ---- | ----------- | ------------- | ----- | -------------- |
| 1 | O Começo | verde-água | espinhos, abismos, inimigos básicos | Sombra Errante | investidas, leques de orbes |
| 2 | A Deriva | carmim | plataformas móveis, voadores, gotas do teto | Guardião do Eclipse | chuva de orbes, anéis |
| 3 | Jardim Sem Voz | verde-folha | espinhos que brotam, plataformas que racham, cuspidores | Mãe das Raízes | espinhos no chão, orbes |
| 4 | Mar de Vidro | azul-gelo | **gelo escorregadio**, brutos que investem | Reflexo Partido | teletransporte, clones |
| 5 | Coração da Tinta | ouro | todas as mecânicas | Coração do Vazio | anéis densos, ondas de choque, invocações |

## Personagem (Hope)

Animações reconstruídas por `npm run sprites`: escala única, pés alinhados, sem fragmentos.
Movimento: correr com aceleração, pulo de altura variável (toque curto x segurar), *coyote time*,
*jump buffer*, tempo suspenso no topo, queda rápida, dash com invulnerabilidade, pulo na parede, agachar,
pincel em 2 fases (arco baixo e alto), tiro de tinta e **Nova** (super, com a barra de tinta cheia).
Feedback: *squash & stretch*, poeira, rastro do dash, inclinação ao correr, *hit stop*, tremor de câmera.

## Progressão e pontuação

- Gotas: pontos e barra de Nova. A cada 20 gotas, +1 de vida. Checkpoint também cura.
- Pontuação da fase = gotas·15 + cristais·250 + vida·120 + inimigos·40 + bônus de tempo − derrotas·150 + 1000·fase (+500 se não foi atingido pelo chefe).
- O ranking usa a soma dos melhores resultados de cada fase.

## Requisitos do trabalho (checklist)

- [x] 5 fases com obstáculos e chefe final em cada uma
- [x] Cenário colorido ao derrotar o chefe
- [x] **API de cor** (TheColorAPI) e **API de clima** (Open-Meteo)
- [x] **Firebase** como banco: conta com nome + senha, ID gerado, progresso e ranking
- [x] Publicável no **GitHub Pages**
- [x] Controles para **celular**

## Ideias futuras

Habilidades desbloqueadas por chefe (metroidvania), trilha sonora gravada, chefe final alternativo,
modo desafio com tempo, conquistas, mais inimigos por fase.
