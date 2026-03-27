import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth } from '../firebase.js';
import { db } from '../firebase.js';
import type { User } from '../types/index.js';

export interface UserRecord {
  uid: string;
  displayName: string;
  email: string;
  createdAt: Date;
}

export async function createUserRecord(user: User): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function getUserRecord(uid: string): Promise<UserRecord | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: data.uid,
    displayName: data.displayName,
    email: data.email,
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName });
  }
}

export async function getUserDisplayNames(uids: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    uids.map(async uid => {
      const record = await getUserRecord(uid);
      return [uid, record?.displayName ?? null] as const;
    })
  );
  const result: Record<string, string> = {};
  for (const [uid, name] of entries) {
    if (name !== null) result[uid] = name;
  }
  return result;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    uid: data.uid,
    displayName: data.displayName,
    email: data.email,
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}
