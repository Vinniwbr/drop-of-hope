import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import {
  firebaseErrorCode,
  getFirebase,
  isFirebaseConfigured,
} from './firebase';
import { ProgressApi } from './progress-api';
import {
  createGuestSession,
  generatePlayerId,
  getSession,
  loadGuestSession,
  type Session,
  setSession,
} from './session';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
/** O Firebase Auth exige e-mail; o nome de usuario vira um e-mail interno. */
const EMAIL_DOMAIN = 'dropoffhope.app';

export class AuthError extends Error {}

function toEmail(username: string) {
  return `${username.toLowerCase()}@${EMAIL_DOMAIN}`;
}

function explain(error: unknown): AuthError {
  const code = firebaseErrorCode(error);
  const messages: Record<string, string> = {
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      'Chave do Firebase inválida. Confira as variáveis VITE_FIREBASE_* no arquivo .env.',
    'auth/configuration-not-found':
      'O Authentication ainda não foi ativado no projeto Firebase (Build > Authentication > Vamos começar).',
    'auth/email-already-in-use':
      'Esse nome de usuário já existe. Escolha outro.',
    'auth/internal-error':
      'Erro interno do Firebase. Confira a chave de API e o projeto no arquivo .env.',
    'auth/invalid-api-key':
      'Chave do Firebase inválida. Confira as variáveis VITE_FIREBASE_* no arquivo .env.',
    'auth/invalid-credential': 'Usuário ou senha incorretos.',
    'auth/invalid-login-credentials': 'Usuário ou senha incorretos.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed':
      'Login por e-mail/senha não está ativado no Firebase (Authentication > Sign-in method).',
    'auth/too-many-requests':
      'Muitas tentativas. Espere um pouco e tente de novo.',
    'auth/unauthorized-domain':
      'Este site não está autorizado no Firebase (Authentication > Settings > Authorized domains).',
    'auth/user-not-found': 'Usuário ou senha incorretos.',
    'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
    'auth/wrong-password': 'Usuário ou senha incorretos.',
    'permission-denied':
      'O banco recusou a gravação. Publique as regras de firestore.rules.',
  };
  const suffix = code ? ` (${code})` : '';
  return new AuthError(
    messages[code] ??
      `Não foi possível concluir agora. Tente novamente${suffix}.`,
  );
}

export function validateCredentials(
  username: string,
  password: string,
): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Nome de usuário: 3 a 16 letras, números ou _ (sem espaços).';
  }
  if (password.length < 6) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  return null;
}

async function loadOrCreateProfile(
  uid: string,
  username: string,
): Promise<Session> {
  const firebase = getFirebase();
  let playerId = generatePlayerId();
  let displayName = username;
  if (firebase) {
    const reference = doc(firebase.db, 'players', uid);
    try {
      const snapshot = await getDoc(reference);
      const data = snapshot.data() as
        { playerId?: string; username?: string } | undefined;
      if (data?.playerId) {
        playerId = data.playerId;
        displayName = data.username ?? username;
      } else {
        await setDoc(
          reference,
          { playerId, updatedAt: Date.now(), username },
          { merge: true },
        );
      }
    } catch {
      // Perfil sera recriado no proximo acesso com rede.
    }
  }
  return { mode: 'user', playerId, uid, username: displayName };
}

export const AuthApi = {
  isOnlineAvailable: isFirebaseConfigured,

  /** Retoma a sessao anterior (conta ou convidado) ao abrir o jogo. */
  async restore(): Promise<Session | null> {
    const firebase = getFirebase();
    if (firebase) {
      try {
        await Promise.race([
          firebase.auth.authStateReady(),
          new Promise((resolve) => window.setTimeout(resolve, 4000)),
        ]);
        const user = firebase.auth.currentUser;
        if (user) {
          const session = await loadOrCreateProfile(
            user.uid,
            user.displayName ?? 'Viajante',
          );
          setSession(session);
          await ProgressApi.load(session);
          return session;
        }
      } catch {
        // Cai para o modo convidado.
      }
    }
    const guest = loadGuestSession();
    if (guest) {
      setSession(guest);
      await ProgressApi.load(guest);
    }
    return guest;
  },

  async register(username: string, password: string): Promise<Session> {
    const problem = validateCredentials(username, password);
    if (problem) {
      throw new AuthError(problem);
    }
    const firebase = getFirebase();
    if (!firebase) {
      throw new AuthError(
        'Contas online ainda não foram configuradas. Jogue como convidado.',
      );
    }
    try {
      const credential = await createUserWithEmailAndPassword(
        firebase.auth,
        toEmail(username),
        password,
      );
      await updateProfile(credential.user, { displayName: username });
      const session = await loadOrCreateProfile(credential.user.uid, username);
      setSession(session);
      await ProgressApi.adoptGuestProgress(session);
      return session;
    } catch (error) {
      throw explain(error);
    }
  },

  async login(username: string, password: string): Promise<Session> {
    const problem = validateCredentials(username, password);
    if (problem) {
      throw new AuthError(problem);
    }
    const firebase = getFirebase();
    if (!firebase) {
      throw new AuthError(
        'Contas online ainda não foram configuradas. Jogue como convidado.',
      );
    }
    try {
      const credential = await signInWithEmailAndPassword(
        firebase.auth,
        toEmail(username),
        password,
      );
      const session = await loadOrCreateProfile(
        credential.user.uid,
        credential.user.displayName ?? username,
      );
      setSession(session);
      await ProgressApi.load(session);
      return session;
    } catch (error) {
      throw explain(error);
    }
  },

  async playAsGuest(name: string): Promise<Session> {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (clean.length < 2) {
      throw new AuthError('Digite um nome com pelo menos 2 letras.');
    }
    const session = createGuestSession(clean);
    setSession(session);
    await ProgressApi.load(session);
    return session;
  },

  async logout(): Promise<void> {
    const firebase = getFirebase();
    if (getSession()?.mode === 'user' && firebase) {
      try {
        await signOut(firebase.auth);
      } catch {
        // Mesmo com falha, a sessao local e encerrada.
      }
    }
    setSession(null);
  },
};
