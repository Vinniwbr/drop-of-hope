import { FirebaseError, getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import { type Firestore, getFirestore } from 'firebase/firestore';

interface FirebaseServices {
  auth: Auth;
  db: Firestore;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

/** So ha conta online quando as variaveis VITE_FIREBASE_* estao preenchidas. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId,
);

let services: FirebaseServices | null | undefined;

export function getFirebase(): FirebaseServices | null {
  if (services !== undefined) {
    return services;
  }
  if (!isFirebaseConfigured) {
    services = null;
    return services;
  }
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    services = { auth: getAuth(app), db: getFirestore(app) };
  } catch {
    services = null;
  }
  return services;
}

export function firebaseErrorCode(error: unknown): string {
  return error instanceof FirebaseError ? error.code : '';
}
