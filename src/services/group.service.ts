import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type { Group, GroupMember } from '../types/index.js';

function toGroup(id: string, data: Record<string, unknown>): Group {
  return {
    id,
    name: data.name as string,
    createdBy: data.createdBy as string,
    members: data.members as GroupMember[],
    memberUids: data.memberUids as string[],
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
  };
}

export function subscribeToGroups(
  uid: string,
  onChange: (groups: Group[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups'),
    where('memberUids', 'array-contains', uid)
  );
  return onSnapshot(q, snap => {
    const groups = snap.docs.map(d => toGroup(d.id, d.data() as Record<string, unknown>));
    groups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    onChange(groups);
  });
}

export async function createGroup(name: string, creator: GroupMember): Promise<string> {
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    createdBy: creator.uid,
    members: [creator],
    memberUids: [creator.uid],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addMemberToGroup(groupId: string, member: GroupMember): Promise<void> {
  const ref = doc(db, 'groups', groupId);
  await updateDoc(ref, {
    members: arrayUnion(member),
    memberUids: arrayUnion(member.uid),
  });
}

export function subscribeToGroup(
  groupId: string,
  onChange: (group: Group | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'groups', groupId), snap => {
    if (!snap.exists()) { onChange(null); return; }
    onChange(toGroup(snap.id, snap.data() as Record<string, unknown>));
  });
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) return null;
  return toGroup(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateGroupName(groupId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { name });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId));
}
