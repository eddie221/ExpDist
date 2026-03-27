import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import type { Expense } from '../types/index.js';

function toExpense(id: string, data: Record<string, unknown>): Expense {
  return {
    id,
    groupId: data.groupId as string,
    description: data.description as string,
    amount: data.amount as number,
    paidBy: data.paidBy as string,
    splitBetween: data.splitBetween as string[],
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
  };
}

export function subscribeToExpenses(
  groupId: string,
  onChange: (expenses: Expense[]) => void
): Unsubscribe {
  const ref = collection(db, 'groups', groupId, 'expenses');
  return onSnapshot(ref, snap => {
    const expenses = snap.docs.map(d => toExpense(d.id, d.data() as Record<string, unknown>));
    expenses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    onChange(expenses);
  });
}

export async function addExpense(
  groupId: string,
  description: string,
  amountCents: number,
  paidBy: string,
  splitBetween: string[]
): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'expenses'), {
    groupId,
    description,
    amount: amountCents,
    paidBy,
    splitBetween,
    createdAt: serverTimestamp(),
  });
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  description: string,
  amountCents: number,
  paidBy: string,
  splitBetween: string[]
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'expenses', expenseId), {
    description,
    amount: amountCents,
    paidBy,
    splitBetween,
  });
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId, 'expenses', expenseId));
}
