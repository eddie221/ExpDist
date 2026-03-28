import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type { LogEntry } from '../types/index.js';

export async function writeLog(
  groupId: string,
  entry: Omit<LogEntry, 'id' | 'createdAt'>
): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'logs'), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToLogs(
  groupId: string,
  onChange: (logs: LogEntry[]) => void
): Unsubscribe {
  const ref = query(
    collection(db, 'groups', groupId, 'logs'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(ref, snap => {
    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        groupId: data.groupId as string,
        action: data.action as LogEntry['action'],
        expenseDescription: data.expenseDescription as string,
        amountCents: data.amountCents as number,
        actorUid: data.actorUid as string,
        actorName: data.actorName as string,
        createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
      } satisfies LogEntry;
    });
    onChange(logs);
  });
}
