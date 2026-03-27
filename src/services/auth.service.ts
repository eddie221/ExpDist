import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { store } from '../store/app.store.js';
import type { User } from '../types/index.js';

function toUser(fbUser: FirebaseUser): User {
  return {
    uid: fbUser.uid,
    displayName: fbUser.displayName ?? fbUser.email ?? 'Anonymous',
    email: fbUser.email,
    photoURL: fbUser.photoURL,
  };
}

export function initAuth(onReady: () => void): () => void {
  let ready = false;
  return onAuthStateChanged(auth, fbUser => {
    store.setState({ user: fbUser ? toUser(fbUser) : null });
    if (!ready) {
      ready = true;
      onReady();
    }
  });
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
