// Firestore (Admin SDK) access. Credentials, in order of preference:
//   FIRESTORE_EMULATOR_HOST (local testing) → FIREBASE_SERVICE_ACCOUNT (JSON string, used in GitHub Actions)
//   → GOOGLE_APPLICATION_CREDENTIALS (path to a key file).
import fs from 'node:fs';
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export { FieldValue, Timestamp };

let db;

export function useKeyFile(file) {
  if (file) process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(file, 'utf8');
}

export function initDb() {
  if (db) return db;
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-parenthood' });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({ credential: cert(sa), projectId: sa.project_id });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() });
    } else {
      throw new Error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or FIRESTORE_EMULATOR_HOST.');
    }
  }
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export function hasCredentials() {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/** Firestore Timestamp / Date → ISO string, recursively (for writing plain JSON files). */
export function toPlain(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

export async function getMembers(db) {
  const snap = await db.collection('members').get();
  return snap.docs.map((d) => ({ email: d.id, ...toPlain(d.data()) }));
}

export async function getLedger(db) {
  const snap = await db.collection('ledger').orderBy('date').get();
  return snap.docs.map((d) => toPlain(d.data()));
}
