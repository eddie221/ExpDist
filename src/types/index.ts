export interface User {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  color?: string;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  email?: string;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  members: GroupMember[];
  memberUids: string[];
  createdAt: Date;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: number; // stored in cents (integer)
  paidBy: string; // uid
  splitBetween: string[]; // uids
  createdAt: Date;
}

export interface Balance {
  uid: string;
  displayName: string;
  net: number; // cents; positive = owed money, negative = owes money
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number; // cents
}

export type Route =
  | { name: 'login' }
  | { name: 'groups' }
  | { name: 'group'; id: string }
  | { name: 'profile' }
  | { name: 'not-found' };
