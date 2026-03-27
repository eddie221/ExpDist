import { store } from '../../store/app.store.js';
import { subscribeToExpenses, deleteExpense } from '../../services/expense.service.js';
import { addMemberToGroup } from '../../services/group.service.js';
import { navigate } from '../../router.js';
import { renderExpenseForm } from './ExpenseForm.js';
import { renderSettlementView } from '../settlement/SettlementView.js';
import { formatCents } from '../../logic/settlement.js';
import type { Group, Expense } from '../../types/index.js';
import type { Unsubscribe } from 'firebase/firestore';

export function renderExpenseList(container: HTMLElement, group: Group): () => void {
  const { user } = store.getState();
  if (!user) return () => {};

  let expenses: Expense[] = [];
  let unsubExpenses: Unsubscribe | null = null;

  function render() {
    const paidByMap: Record<string, string> = {};
    group.members.forEach(m => (paidByMap[m.uid] = m.displayName));

    container.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <button class="btn btn-ghost back-btn" id="back-btn">← Groups</button>
          <h1 class="app-brand group-title">${escapeHtml(group.name)}</h1>
          <div class="header-actions">
            <button class="btn btn-secondary" id="invite-btn">+ Invite</button>
            <button class="btn btn-primary" id="add-expense-btn">+ Expense</button>
          </div>
        </header>

        <main class="main-content">
          <div id="settlement-root"></div>

          <div class="section-header">
            <h2>Expenses</h2>
          </div>

          ${expenses.length === 0
            ? '<div class="empty-state"><p>No expenses yet. Add one to get started!</p></div>'
            : ''
          }

          <ul class="expense-list">
            ${expenses.map(exp => `
              <li class="expense-item">
                <div class="expense-info">
                  <span class="expense-desc">${escapeHtml(exp.description)}</span>
                  <span class="expense-meta">
                    Paid by ${escapeHtml(paidByMap[exp.paidBy] ?? exp.paidBy)}
                    &mdash; split ${exp.splitBetween.length} way${exp.splitBetween.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div class="expense-right">
                  <span class="expense-amount">${formatCents(exp.amount)}</span>
                  <button class="btn btn-danger btn-sm expense-delete" data-id="${exp.id}">✕</button>
                </div>
              </li>
            `).join('')}
          </ul>
        </main>

        <div id="modal-root"></div>
      </div>
    `;

    // Settlement view
    const settlementRoot = container.querySelector<HTMLElement>('#settlement-root')!;
    if (expenses.length > 0) {
      renderSettlementView(settlementRoot, group, expenses);
    }

    container.querySelector('#back-btn')!.addEventListener('click', () =>
      navigate({ name: 'groups' })
    );

    container.querySelector('#add-expense-btn')!.addEventListener('click', () => {
      const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
      renderExpenseForm(modalRoot, group, user!, () => { modalRoot.innerHTML = ''; });
    });

    container.querySelector('#invite-btn')!.addEventListener('click', async () => {
      const email = prompt('Enter the display name of the new member:');
      if (!email?.trim()) return;
      const uid = prompt('Enter their Firebase UID (copy from their profile):');
      if (!uid?.trim()) return;
      try {
        await addMemberToGroup(group.id, { uid: uid.trim(), displayName: email.trim() });
        alert('Member added!');
      } catch (err) {
        console.error(err);
        alert('Failed to add member.');
      }
    });

    container.querySelectorAll('.expense-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm('Delete this expense?')) {
          await deleteExpense(group.id, id);
        }
      });
    });
  }

  unsubExpenses = subscribeToExpenses(group.id, newExpenses => {
    expenses = newExpenses;
    render();
  });

  render();

  return () => { unsubExpenses?.(); };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
