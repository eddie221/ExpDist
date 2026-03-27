import { computeBalances, simplifyDebts, formatCents } from '../../logic/settlement.js';
import type { Expense, Group } from '../../types/index.js';

export function renderSettlementView(
  container: HTMLElement,
  group: Group,
  expenses: Expense[]
): void {
  const balances = computeBalances(expenses, group.members);
  const settlements = simplifyDebts(balances);

  const balanceRows = balances
    .map(b => {
      const cls = b.net > 0 ? 'positive' : b.net < 0 ? 'negative' : 'zero';
      const label = b.net > 0 ? `gets back ${formatCents(b.net)}` : b.net < 0 ? `owes ${formatCents(b.net)}` : 'settled up';
      return `
        <li class="balance-item">
          <span class="balance-name">${escapeHtml(b.displayName)}</span>
          <span class="balance-amount ${cls}">${label}</span>
        </li>
      `;
    })
    .join('');

  const settlementRows = settlements.length === 0
    ? '<p class="empty-state-text">Everyone is settled up!</p>'
    : settlements.map(s => `
        <li class="settlement-item">
          <span class="settlement-from">${escapeHtml(s.fromName)}</span>
          <span class="settlement-arrow">→</span>
          <span class="settlement-to">${escapeHtml(s.toName)}</span>
          <span class="settlement-amount">${formatCents(s.amount)}</span>
        </li>
      `).join('');

  container.innerHTML = `
    <section class="settlement-section">
      <h3 class="section-title">Balances</h3>
      <ul class="balance-list">${balanceRows}</ul>

      <h3 class="section-title">Suggested Payments</h3>
      <ul class="settlement-list">${settlementRows}</ul>
    </section>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
