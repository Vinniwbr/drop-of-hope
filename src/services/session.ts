import { readJson, writeJson } from '../utils';

export interface Session {
  mode: 'guest' | 'user';
  /** Codigo publico do jogador, por exemplo DOH-7K2M9Q. */
  playerId: string;
  uid: string | null;
  username: string;
}

interface GuestRecord {
  playerId: string;
  username: string;
}

const GUEST_KEY = 'drop-off-hope:guest:v1';
/** Sem 0/O e 1/I para o codigo ser facil de ditar. */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let current: Session | null = null;

export function generatePlayerId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return `DOH-${code}`;
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session | null) {
  current = session;
}

export function loadGuestSession(): Session | null {
  const record = readJson<GuestRecord | null>(GUEST_KEY, null);
  if (!record?.username) {
    return null;
  }
  return {
    mode: 'guest',
    playerId: record.playerId,
    uid: null,
    username: record.username,
  };
}

export function createGuestSession(username: string): Session {
  const previous = readJson<GuestRecord | null>(GUEST_KEY, null);
  const record: GuestRecord = {
    playerId: previous?.playerId ?? generatePlayerId(),
    username,
  };
  writeJson(GUEST_KEY, record);
  return {
    mode: 'guest',
    playerId: record.playerId,
    uid: null,
    username,
  };
}

/** Chave de armazenamento local isolada por jogador. */
export function progressStorageKey(session: Session) {
  return `drop-off-hope:progress:v2:${session.uid ?? 'guest'}`;
}
