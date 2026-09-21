# Configurar o Firebase (contas, progresso e ranking)

O jogo funciona **sem** Firebase (modo convidado, progresso salvo no aparelho).
Com o Firebase ativado, o jogador ganha:

- **conta** (nome de usuário + senha) e um **ID único** (ex.: `DOH-7K2M9Q`);
- **progresso na nuvem** (entra de outro aparelho e continua de onde parou);
- **ranking mundial** com pontuação total.

Tudo fica no plano gratuito (Spark). Leva uns 10 minutos.

## 1. Criar o projeto

1. Abra <https://console.firebase.google.com> e entre com sua conta Google.
2. **Adicionar projeto** → dê um nome (ex.: `drop-off-hope`) → pode desligar o Google Analytics → **Criar projeto**.

## 2. Registrar o app web e copiar as chaves

1. Na página inicial do projeto, clique no ícone **`</>` (Web)**.
2. Apelido do app: `drop-off-hope`. **Não** marque "Firebase Hosting" (o jogo vai para o GitHub Pages). Clique em **Registrar app**.
3. O console mostra um bloco `firebaseConfig`. Copie os valores para o arquivo **`.env`** do projeto:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
```

> Esses valores **não são segredos**: qualquer site com Firebase os expõe no navegador.
> A segurança vem das regras do banco (passo 5) e dos domínios autorizados (passo 6).
> Pode commitar o `.env`.

## 3. Ativar o login por e-mail/senha

1. Menu **Build → Authentication → Vamos começar**.
2. Aba **Sign-in method** → **E-mail/senha** → ative a primeira opção → **Salvar**.

O jogo só pede *nome de usuário* e senha. Por baixo, ele transforma o nome em um
e-mail interno (`nome@dropoffhope.app`), porque o Firebase exige um e-mail.
Nenhum e-mail real é coletado nem enviado.

## 4. Criar o banco Firestore

1. **Build → Firestore Database → Criar banco de dados**.
2. Local: `southamerica-east1` (São Paulo) é uma boa escolha para o Brasil.
3. Modo: **produção** (as regras do próximo passo liberam só o necessário).

## 5. Publicar as regras de segurança

1. Firestore → aba **Regras**.
2. Apague tudo e cole o conteúdo do arquivo **`firestore.rules`** deste projeto.
3. **Publicar**.

O que as regras garantem:

| Coleção            | Quem lê        | Quem escreve   |
| ------------------ | -------------- | -------------- |
| `players/{uid}`    | só o dono      | só o dono      |
| `leaderboard/{uid}`| todos          | só o dono      |

Também validam tipos e limites (nome até 16 letras, pontuação até 100 000, etc.).

## 6. Autorizar o domínio do GitHub Pages

Sem isso o login funciona no seu computador, mas **falha no site publicado**.

1. **Authentication → Settings → Authorized domains → Add domain**.
2. Adicione `SEU-USUARIO.github.io` (só o domínio, sem `https://` e sem `/repositorio`).
   `localhost` já vem autorizado.

## 7. Testar

```sh
npm start
```

1. Aba **Criar conta** → escolha nome e senha → o jogo mostra seu **ID**.
2. Jogue/ conclua uma fase → abra o **Ranking**.
3. No console do Firebase, **Firestore → Dados**: aparecem `players` e `leaderboard`.
4. Feche a aba, abra de novo → entra direto (sessão lembrada). Use **Perfil → Sair** e faça **Entrar** para conferir o login.

## Problemas comuns

| Mensagem no jogo | Causa | Solução |
| --- | --- | --- |
| "Contas online ainda não foram configuradas" | `.env` sem as chaves | Passo 2; reinicie o `npm start` |
| "Login por e-mail/senha não está ativado" | Provedor desligado | Passo 3 |
| "O banco recusou a gravação" | Regras não publicadas | Passo 5 |
| Funciona local, falha no site | Domínio não autorizado | Passo 6 |
| "Esse nome de usuário já existe" | Nome já cadastrado | Escolha outro nome |

## (Opcional) Proteger a chave de API

No [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
sua chave de API "Browser key" → **Restrições de aplicativo → Sites (HTTP referrers)** →
adicione `https://SEU-USUARIO.github.io/*` e `http://localhost:*`.

## Limitações honestas

- A pontuação vem do navegador; um jogador técnico poderia forjar um valor (até o limite das regras).
  Para um trabalho escolar isso é aceitável; para valer prêmio, seria preciso validar no servidor (Cloud Functions).
- Não há recuperação de senha (não guardamos e-mail real). Quem esquecer a senha cria outra conta.
