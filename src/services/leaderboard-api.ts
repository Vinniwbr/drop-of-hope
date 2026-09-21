import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { readJson, writeJson } from '../utils';
import { getFirebase } from './firebase';
import type { GameProgress } from './progress-api';
import type { Session } from './session';

const LOCAL_KEY = 'drop-off-hope:leaderboard:v3';

export interface LeaderboardEntry {
  isYou?: boolean;
  phases: number;
  playerId: string;
  totalScore: number;
  username: string;
}

function sortEntries(entries: LeaderboardEntry[]) {
  const best = new Map<string, LeaderboardEntry>();
  for (const entry of entries) {
    const known = best.get(entry.playerId);
    if (!known || entry.totalScore > known.totalScore) {
      best.set(entry.playerId, entry);
    }
  }
  return [...best.values()]
    .filter((entry) => entry.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10);
}

export const LeaderboardApi = {
  /** Ranking de contas: Firestore mais a copia local das contas deste aparelho. */
  async list(session: Session | null): Promise<LeaderboardEntry[]> {
    const local = readJson<LeaderboardEntry[]>(LOCAL_KEY, []);
    let remote: LeaderboardEntry[] = [];
    const firebase = getFirebase();
    if (firebase) {
      try {
        const snapshot = await getDocs(
          query(
            collection(firebase.db, 'leaderboard'),
            orderBy('totalScore', 'desc'),
            limit(10),
          ),
        );
        remote = snapshot.docs.map((entry) => {
          const data = entry.data() as Partial<LeaderboardEntry>;
          return {
            phases: data.phases ?? 0,
            playerId: data.playerId ?? entry.id,
            totalScore: data.totalScore ?? 0,
            username: data.username ?? 'Viajante',
          };
        });
      } catch {
        // Sem rede: mostra apenas o ranking local.
      }
    }
    return sortEntries([...remote, ...local]).map((entry) => ({
      ...entry,
      isYou: entry.playerId === session?.playerId,
    }));
  },

  /** Guarda pontuacao apenas para jogadores autenticados. */
  async submit(session: Session, progress: GameProgress): Promise<void> {
    const firebase = getFirebase();
    if (session.mode !== 'user' || !session.uid) {
      return;
    }
    const entry: LeaderboardEntry = {
      phases: progress.completedPhases.length,
      playerId: session.playerId,
      totalScore: progress.totalScore,
      username: session.username,
    };
    writeJson(
      LOCAL_KEY,
      sortEntries([...readJson<LeaderboardEntry[]>(LOCAL_KEY, []), entry]),
    );

    if (!firebase) {
      return;
    }
    try {
      await setDoc(doc(firebase.db, 'leaderboard', session.uid), {
        ...entry,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // A copia local permanece; o envio acontece na proxima vitoria.
    }
  },
};
