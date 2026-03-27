import { addExpense } from '../../services/expense.service.js';
import type { Group, User } from '../../types/index.js';

export function renderExpenseForm(
  container: HTMLElement,
  group: Group,
  currentUser: User,
  onClose: () => void
): void {
  const memberOptions = group.members
    .map(m => `<option value="${m.uid}"${m.uid === currentUser.uid ? ' selected' : ''}>${escapeHtml(m.displayName)}</option>`)
    .join('');

  const memberCheckboxes = group.members
    .map(m => `
      <label class="checkbox-label">
        <input type="checkbox" name="split" value="${m.uid}" checked />
        ${escapeHtml(m.displayName)}
      </label>
    `)
    .join('');

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>Add Expense</h3>
          <button class="btn-close" id="modal-close">&times;</button>
        </div>
        <form id="expense-form" class="modal-body">
          <div class="form-field">
            <label for="description">Description</label>
            <input id="description" type="text" class="input" placeholder="e.g. Dinner" maxlength="120" required autofocus />
          </div>
          <div class="form-field">
            <label for="amount">Amount ($)</label>
            <input id="amount" type="number" class="input" placeholder="0.00" step="0.01" min="0.01" required />
          </div>
          <div class="form-field">
            <label for="paid-by">Paid by</label>
            <select id="paid-by" class="input">${memberOptions}</select>
          </div>
          <div class="form-field">
            <label>Split between</label>
            <div class="checkbox-group">${memberCheckboxes}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Add Expense</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => onClose();
  container.querySelector('#modal-close')!.addEventListener('click', close);
  container.querySelector('#cancel-btn')!.addEventListener('click', close);
  container.querySelector('#modal-overlay')!.addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal-overlay')) close();
  });

  container.querySelector('#expense-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;

    const description = (form.querySelector('#description') as HTMLInputElement).value.trim();
    const amountDollars = parseFloat((form.querySelector('#amount') as HTMLInputElement).value);
    const paidBy = (form.querySelector('#paid-by') as HTMLSelectElement).value;
    const splitBetween = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="split"]:checked'))
      .map(cb => cb.value);

    if (!description || isNaN(amountDollars) || amountDollars <= 0 || splitBetween.length === 0) return;

    const amountCents = Math.round(amountDollars * 100);

    const submitBtn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    try {
      await addExpense(group.id, description, amountCents, paidBy, splitBetween);
      close();
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Expense';
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
