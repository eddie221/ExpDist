import { computeBalances, simplifyDebts, formatCents } from '../../logic/settlement.js';
import { store } from '../../store/app.store.js';
import type { Expense, Group, Settlement } from '../../types/index.js';

export function renderSettlementView(
  container: HTMLElement,
  group: Group,
  expenses: Expense[],
  onConfirm: (from: string, to: string, amount: number) => Promise<void>,
  onRenameGroup: () => void
): void {
  const currentUid = store.getState().user?.uid;
  const balances = computeBalances(expenses, group.members);
  const settlements = simplifyDebts(balances);

  const balanceRows = balances
    .map(b => {
      const cls = b.net > 0 ? 'positive' : b.net < 0 ? 'negative' : 'zero';
      const label = b.net > 0
        ? `gets back ${formatCents(b.net)}`
        : b.net < 0 ? `owes ${formatCents(b.net)}`
        : 'settled up';
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
    : settlements.map((s, i) => `
        <li class="settlement-item">
          <div class="settlement-info">
            <span class="settlement-from">${escapeHtml(s.fromName)}</span>
            <span class="settlement-arrow">→</span>
            <span class="settlement-to">${escapeHtml(s.toName)}</span>
            <span class="settlement-amount">${formatCents(s.amount)}</span>
          </div>
          ${s.from === currentUid
            ? `<button class="btn btn-sm btn-confirm" data-index="${i}">Confirm</button>`
            : ''
          }
        </li>
      `).join('');

  container.innerHTML = `
    <section class="settlement-section">
      <div class="settlement-group-header">
        <span class="settlement-group-name">${escapeHtml(group.name)}</span>
        <button class="btn-icon" id="settlement-rename-btn" title="Rename group">✎</button>
      </div>
      <h3 class="section-title">Balances</h3>
      <ul class="balance-list">${balanceRows}</ul>

      <h3 class="section-title">Suggested Payments</h3>
      <ul class="settlement-list">${settlementRows}</ul>
    </section>
  `;

  container.querySelector('#settlement-rename-btn')!.addEventListener('click', onRenameGroup);

  container.querySelectorAll<HTMLButtonElement>('.btn-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index!);
      const s: Settlement = settlements[index];
      if (!confirm(`Confirm that ${s.fromName} paid ${s.toName} ${formatCents(s.amount)}?`)) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await onConfirm(s.from, s.to, s.amount);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = 'Confirm';
      }
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
