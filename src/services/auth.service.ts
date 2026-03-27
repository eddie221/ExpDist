import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { store } from '../store/app.store.js';
import { createUserRecord, getUserRecord } from './user.service.js';


export function initAuth(onReady: () => void): () => void {
  let ready = false;
  return onAuthStateChanged(auth, async fbUser => {
    if (fbUser) {
      const record = await getUserRecord(fbUser.uid);
      store.setState({
        user: {
          uid: fbUser.uid,
          displayName: record?.displayName ?? fbUser.displayName ?? fbUser.email ?? 'User',
          email: fbUser.email,
          photoURL: fbUser.photoURL,
        },
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
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });

  // Create the user record in Firestore
  await createUserRecord({
    uid: cred.user.uid,
    displayName,
    email: email.toLowerCase().trim(),
    photoURL: null,
  });
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

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
