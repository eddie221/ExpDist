import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { store } from '../store/app.store.js';
import { createUserRecord, getUserRecord } from './user.service.js';


// Set before createUserWithEmailAndPassword so onAuthStateChanged picks it up immediately
let pendingDisplayName: string | null = null;

export function initAuth(onReady: () => void): () => void {
  let ready = false;
  return onAuthStateChanged(auth, async fbUser => {
    if (fbUser) {
      let displayName: string;
      if (pendingDisplayName) {
        // Sign-up in progress — use the known name, skip Firestore lookup
        displayName = pendingDisplayName;
      } else {
        displayName = fbUser.displayName ?? fbUser.email ?? 'User';
        try {
          const record = await getUserRecord(fbUser.uid);
          if (record?.displayName) displayName = record.displayName;
        } catch {
          // fall back to Firebase Auth display name
        }
      }
      store.setState({
        user: { uid: fbUser.uid, displayName, email: fbUser.email, photoURL: fbUser.photoURL },
      });
    } else {
      store.setState({ user: null });
    }
    if (!ready) {
      ready = true;
      onReady();
    }
  });
}

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
  pendingDisplayName = displayName;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await createUserRecord({
      uid: cred.user.uid,
      displayName,
      email: email.toLowerCase().trim(),
      photoURL: null,
    });
    store.setState({
      user: { uid: cred.user.uid, displayName, email: cred.user.email, photoURL: null },
    });
  } finally {
    pendingDisplayName = null;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  // Verify the user record exists in Firestore
  const record = await getUserRecord(cred.user.uid);
  if (!record) {
    await firebaseSignOut(auth);
    throw Object.assign(new Error('User record not found.'), { code: 'auth/user-record-missing' });
  }
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.toLowerCase().trim());
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
