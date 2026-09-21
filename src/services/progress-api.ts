import { doc, getDoc, setDoc } from 'firebase/firestore';

import { PHASE_COUNT } from '../constants';
import { readJson, writeJson } from '../utils';
import { getFirebase } from './firebase';
import { getSession, progressStorageKey, type Session } from './session';

export interface GameStats {
  deaths: number;
  drops: number;
  kills: number;
  playMs: number;
}

export interface GameProgress {
  bestScores: Record<string, number>;
  completedPhases: number[];
  stats: GameStats;
  totalScore: number;
  updatedAt: number;
}

export interface PhaseResult {
  deaths: number;
  drops: number;
  kills: number;
  score: number;
  timeMs: number;
}

function emptyProgress(): GameProgress {
  return {
    bestScores: {},
    completedPhases: [],
    stats: { deaths: 0, drops: 0, kills: 0, playMs: 0 },
    totalScore: 0,
    updatedAt: 0,
  };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/** Garante formato valido mesmo com dados antigos ou corrompidos. */
export function normalizeProgress(value: unknown): GameProgress {
  const raw = (value ?? {}) as Partial<
    Record<keyof GameProgress, unknown> & { stats: Partial<GameStats> }
  >;
  const bestScores: Record<string, number> = {};
  const rawScores = (raw.bestScores ?? {}) as Record<string, unknown>;
  for (let phase = 1; phase <= PHASE_COUNT; phase++) {
    const score = num(rawScores[String(phase)]);
    if (score > 0) {
      bestScores[String(phase)] = Math.round(score);
    }
  }
  const phases = Array.isArray(raw.completedPhases)
    ? (raw.completedPhases as unknown[])
    : [];
  const completedPhases = [
    ...new Set(
      phases.filter(
        (phase): phase is number =>
          typeof phase === 'number' && phase >= 1 && phase <= PHASE_COUNT,
      ),
    ),
  ].sort((a, b) => a - b);
  const stats = raw.stats ?? {};
  return {
    bestScores,
    completedPhases,
    stats: {
      deaths: num(stats.deaths),
      drops: num(stats.drops),
      kills: num(stats.kills),
      playMs: num(stats.playMs),
    },
    totalScore: Object.values(bestScores).reduce((sum, s) => sum + s, 0),
    updatedAt: num(raw.updatedAt),
  };
}

function mergeProgress(a: GameProgress, b: GameProgress): GameProgress {
  const bestScores: Record<string, number> = { ...a.bestScores };
  for (const [phase, score] of Object.entries(b.bestScores)) {
    bestScores[phase] = Math.max(bestScores[phase] ?? 0, score);
  }
  return normalizeProgress({
    bestScores,
    completedPhases: [...a.completedPhases, ...b.completedPhases],
    stats: {
      deaths: Math.max(a.stats.deaths, b.stats.deaths),
      drops: Math.max(a.stats.drops, b.stats.drops),
      kills: Math.max(a.stats.kills, b.stats.kills),
      playMs: Math.max(a.stats.playMs, b.stats.playMs),
    },
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  });
}

let progress: GameProgress = emptyProgress();
let cloudSaveTimer: number | undefined;

function readLocal(session: Session): GameProgress {
  return normalizeProgress(
    readJson<unknown>(progressStorageKey(session), null),
  );
}

async function saveToCloud(session: Session, data: GameProgress) {
  const firebase = getFirebase();
  if (session.mode !== 'user' || !session.uid || !firebase) {
    return;
  }
  try {
    await setDoc(
      doc(firebase.db, 'players', session.uid),
      {
        bestScores: data.bestScores,
        completedPhases: data.completedPhases,
        playerId: session.playerId,
        stats: data.stats,
        totalScore: data.totalScore,
        updatedAt: data.updatedAt,
        username: session.username,
      },
      { merge: true },
    );
  } catch {
    // Sem rede: a copia local segue valida e sera enviada no proximo salvamento.
  }
}

export const ProgressApi = {
  get(): GameProgress {
    return progress;
  },

  isComplete(phaseId: number): boolean {
    return progress.completedPhases.includes(phaseId);
  },

  isUnlocked(phaseId: number): boolean {
    if (phaseId <= 1) return true;
    return Array.from({ length: phaseId - 1 }, (_, index) => index + 1).every(
      (requiredPhase) => progress.completedPhases.includes(requiredPhase),
    );
  },

  /** Carrega o progresso local e mescla com a nuvem quando ha conta. */
  async load(session: Session): Promise<GameProgress> {
    progress = readLocal(session);
    const firebase = getFirebase();
    if (session.mode === 'user' && session.uid && firebase) {
      try {
        const snapshot = await getDoc(doc(firebase.db, 'players', session.uid));
        if (snapshot.exists()) {
          progress = mergeProgress(
            progress,
            normalizeProgress(snapshot.data()),
          );
        }
        writeJson(progressStorageKey(session), progress);
        void saveToCloud(session, progress);
      } catch {
        // Offline: usa so o progresso local.
      }
    }
    return progress;
  },

  /** Ao criar conta, traz junto o que foi jogado como convidado. */
  async adoptGuestProgress(session: Session): Promise<void> {
    const guestKey = 'drop-off-hope:progress:v2:guest';
    const guest = normalizeProgress(readJson<unknown>(guestKey, null));
    progress = mergeProgress(readLocal(session), guest);
    writeJson(progressStorageKey(session), progress);
    await saveToCloud(session, progress);
  },

  persist() {
    const session = getSession();
    if (!session) {
      return;
    }
    progress = { ...progress, updatedAt: Date.now() };
    writeJson(progressStorageKey(session), progress);
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => {
      void saveToCloud(session, progress);
    }, 1200);
  },

  addStats(delta: Partial<GameStats>) {
    progress = {
      ...progress,
      stats: {
        deaths: progress.stats.deaths + (delta.deaths ?? 0),
        drops: progress.stats.drops + (delta.drops ?? 0),
        kills: progress.stats.kills + (delta.kills ?? 0),
        playMs: progress.stats.playMs + (delta.playMs ?? 0),
      },
    };
    this.persist();
  },

  /** Registra a vitoria contra o chefe e devolve o progresso atualizado. */
  completePhase(phaseId: number, result: PhaseResult): GameProgress {
    const key = String(phaseId);
    progress = normalizeProgress({
      ...progress,
      bestScores: {
        ...progress.bestScores,
        [key]: Math.max(progress.bestScores[key] ?? 0, result.score),
      },
      completedPhases: [...progress.completedPhases, phaseId],
    });
    this.persist();
    return progress;
  },
};
