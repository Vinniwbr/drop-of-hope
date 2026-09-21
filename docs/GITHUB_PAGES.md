# Publicar no GitHub Pages

O projeto já traz o fluxo `.github/workflows/deploy-pages.yml`: a cada envio para
`main` ele instala, gera o build (`npm run build`) e publica a pasta `dist/`.

> **Atenção:** a pasta local ainda aponta para o repositório do template original
> (`remarkablegames/phaser-platformer`). **Não dê `git push` antes de trocar o
> remoto**, senão você tenta enviar para o repositório de outra pessoa.

## 1. Criar seu repositório

1. No GitHub: **New repository** → nome (ex.: `drop-off-hope`) → **Public** → *não* marque README/gitignore/licença → **Create**.
2. No terminal, dentro da pasta do jogo:

```sh
git remote set-url origin https://github.com/SEU-USUARIO/drop-off-hope.git
git remote -v
```

O comando `git remote -v` deve mostrar o **seu** repositório.

## 2. Enviar o código

```sh
git branch -M main
git add .
git commit -m "feat: versão jogável do Drop of Hope"
git push -u origin main
```

> O projeto valida a mensagem do commit (padrão *conventional commits*): use o formato
> `tipo: descrição`, como `feat: ...`, `fix: ...` ou `docs: ...`. Antes de cada commit ele também roda a
> checagem de tipos e o lint automaticamente (leva alguns segundos).

## 3. Ligar o Pages

1. No repositório: **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Aba **Actions**: espere o fluxo "Publicar no GitHub Pages" ficar verde (~2 min).
4. O endereço aparece em Settings → Pages: `https://SEU-USUARIO.github.io/drop-off-hope/`.

## 4. Depois de publicar

- Se usa Firebase: adicione `SEU-USUARIO.github.io` em **Authentication → Settings → Authorized domains** ([docs/FIREBASE.md](FIREBASE.md), passo 6).
- Abra o link no celular e no computador para conferir.
- Cada novo `git push` na `main` republica sozinho.

## Se algo falhar

| Sintoma | Causa provável |
| --- | --- |
| Tela branca no site | Abra o console (F12). Se houver erro 404 de arquivo, confira se o Pages usa **GitHub Actions** como fonte |
| Fluxo vermelho em `npm ci` | `package-lock.json` não foi commitado |
| Login não funciona só no site | Domínio não autorizado no Firebase |
| Clima/cores não aparecem | Sem internet no aparelho (o jogo continua funcionando, só sem esses extras) |

## Testar o build localmente antes

```sh
npm run build
npm run preview
```
