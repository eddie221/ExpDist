import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type { Invite } from '../types/index.js';

function generateToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createInvite(groupId: string, groupName: string, createdBy: string): Promise<string> {
  const token = generateToken();
  await setDoc(doc(db, 'invites', token), {
    groupId,
    groupName,
    createdBy,
    createdAt: serverTimestamp(),
  });
  return token;
}

export async function getInvite(token: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', token));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    token,
    groupId: data.groupId as string,
    groupName: data.groupName as string,
    createdBy: data.createdBy as string,
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
  };
}
