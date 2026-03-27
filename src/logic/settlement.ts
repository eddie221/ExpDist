import type { Expense, Balance, Settlement, GroupMember } from '../types/index.js';

export function computeBalances(expenses: Expense[], members: GroupMember[]): Balance[] {
  const net: Record<string, number> = {};
  members.forEach(m => (net[m.uid] = 0));

  for (const expense of expenses) {
    const splitCount = expense.splitBetween.length;
    if (splitCount === 0) continue;
    const share = Math.round(expense.amount / splitCount);
    net[expense.paidBy] = (net[expense.paidBy] ?? 0) + expense.amount;
    expense.splitBetween.forEach(uid => {
      net[uid] = (net[uid] ?? 0) - share;
    });
  }

  return members.map(m => ({
    uid: m.uid,
    displayName: m.displayName,
    net: net[m.uid] ?? 0,
  }));
}

export function simplifyDebts(balances: Balance[]): Settlement[] {
  // Clone so we can mutate
  const creditors = balances
    .filter(b => b.net > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.net - a.net);

  const debtors = balances
    .filter(b => b.net < 0)
    .map(b => ({ ...b }))
    .sort((a, b) => a.net - b.net);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const credit = creditors[i];
    const debtor = debtors[j];
    const amount = Math.min(credit.net, -debtor.net);

    settlements.push({
      from: debtor.uid,
      fromName: debtor.displayName,
      to: credit.uid,
      toName: credit.displayName,
      amount,
    });

    credit.net -= amount;
    debtor.net += amount;

    if (credit.net < 1) i++;
    if (debtor.net > -1) j++;
  }

  return settlements;
}

export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  return `$${(abs / 100).toFixed(2)}`;
}
