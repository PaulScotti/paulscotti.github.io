// Firebase: Google sign-in (remembered on this device) + Firestore (private data, guarded by security rules).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged,
  signOut as fbSignOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, getDocs, collection, query, orderBy, limit, startAfter, onSnapshot,
  setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

let auth;
let db;
let preferRedirect = false;

export function init(config, { emulator = false } = {}) {
  // Redirect sign-in is the most reliable on phones and in-app browsers, but only when the auth helper is served
  // from this site's own domain (see pipeline/setup.mjs --self-host-auth) - otherwise use the popup flow.
  preferRedirect = emulator || config.authDomain === location.host;
  const app = initializeApp(config);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

/** Completes a redirect sign-in (if one is in flight). Resolves to an error message or ''. */
export async function redirectError() {
  try {
    await getRedirectResult(auth);
    return '';
  } catch (e) {
    return e.code === 'auth/redirect-cancelled-by-user' ? '' : (e.code || e.message || String(e));
  }
}

export const onUser = (cb) => onAuthStateChanged(auth, cb);

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (preferRedirect) {
    await signInWithRedirect(auth, provider);
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    throw e;
  }
}

export const signOut = () => fbSignOut(auth);

// ---------- reads ----------
export async function getMember(email) {
  const snap = await getDoc(doc(db, 'members', email));
  return snap.exists() ? { email, ...snap.data() } : null;
}

export const watchMembers = (cb) => onSnapshot(collection(db, 'members'), (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));

export const watchOverview = (cb, onError) => onSnapshot(collection(db, 'overview'), (s) => {
  // Digests can be prepared ahead; each one appears on its own (Pacific) date.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const days = s.docs.flatMap((d) => d.data().days || []).filter((d) => d.date <= today);
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  cb(days);
}, onError);

export async function getDigest(date) {
  const snap = await getDoc(doc(db, 'digests', date));
  return snap.exists() ? snap.data() : null;
}

export async function getDigestPage(afterDate, n = 2) {
  const parts = [collection(db, 'digests'), orderBy('date', 'desc')];
  if (afterDate) parts.push(startAfter(afterDate));
  parts.push(limit(n));
  const snap = await getDocs(query(...parts));
  return snap.docs.map((d) => d.data());
}

export const watchState = (cb) => onSnapshot(doc(db, 'state', 'couple'), (s) => cb(s.exists() ? s.data() : { stage: 'ttc' }));
export const watchQuestions = (cb) => onSnapshot(collection(db, 'questions'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const watchInbox = (cb) => onSnapshot(collection(db, 'inbox'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const watchFeedback = (cb) => onSnapshot(collection(db, 'feedback'), (s) => cb(s.docs.map((d) => d.data())));

// ---------- writes ----------
export const markRead = (email, date) => updateDoc(doc(db, 'members', email), { [`reads.${date}`]: serverTimestamp(), lastSeen: serverTimestamp() });

export const saveState = (email, s) => setDoc(doc(db, 'state', 'couple'), {
  stage: s.stage, lmp: s.lmp || null, due: s.due || null, birth: s.birth || null, updatedBy: email, updatedAt: serverTimestamp(),
});

export const addQuestion = (email, { text, lang, sourceDate }) => addDoc(collection(db, 'questions'), {
  text, lang, sourceDate: sourceDate || null, by: email, at: serverTimestamp(), done: false,
});
export const setQuestionDone = (email, id, done) => updateDoc(doc(db, 'questions', id), { done, doneAt: done ? serverTimestamp() : null, doneBy: done ? email : null });
export const deleteQuestion = (id) => deleteDoc(doc(db, 'questions', id));

export const addInbox = (email, { kind, text, lang }) => addDoc(collection(db, 'inbox'), {
  kind, text, lang, by: email, at: serverTimestamp(), status: 'open',
});
export const deleteInbox = (id) => deleteDoc(doc(db, 'inbox', id));

export const vote = (email, date, v) => setDoc(doc(db, 'feedback', `${date}__${email}`), { date, by: email, vote: v, at: serverTimestamp() });

export async function exportAll() {
  const out = {};
  for (const name of ['digests', 'overview', 'questions', 'inbox', 'feedback', 'members', 'state']) {
    const s = await getDocs(collection(db, name));
    out[name] = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
  }
  return out;
}
