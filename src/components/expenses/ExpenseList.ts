import { store } from '../../store/app.store.js';
import { subscribeToExpenses, deleteExpense, addExpense } from '../../services/expense.service.js';
import { addMemberToGroup, updateGroupName, subscribeToGroup, removeMemberFromGroup } from '../../services/group.service.js';
import { getUserByEmail, getUserRecord } from '../../services/user.service.js';
import { writeLog, subscribeToLogs } from '../../services/log.service.js';
import { navigate } from '../../router.js';
import { renderExpenseForm } from './ExpenseForm.js';
import { renderSettlementView } from '../settlement/SettlementView.js';
import { formatCents } from '../../logic/settlement.js';
import type { Group, Expense, LogEntry } from '../../types/index.js';
import type { Unsubscribe } from 'firebase/firestore';

const PALETTE = ['#e53e3e','#dd6b20','#ecc94b','#38a169','#319795','#4f6ef7','#805ad5','#d53f8c'];

function avatarColor(uid: string, colorMap: Record<string, string>): string {
  if (colorMap[uid]) return colorMap[uid];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function renderExpenseList(container: HTMLElement, initialGroup: Group): () => void {
  const { user } = store.getState();
  if (!user) return () => {};

  let group = initialGroup;

  let expenses: Expense[] = [];
  let logs: LogEntry[] = [];
  let memberNameMap: Record<string, string> = {};
  let memberColorMap: Record<string, string> = {};
  let profilesReady = false;
  let activeTab: 'expenses' | 'history' = 'expenses';
  let searchQuery = '';
  let filterPaidBy = '';
  let unsubGroup: Unsubscribe | null = null;
  let unsubExpenses: Unsubscribe | null = null;
  let unsubLogs: Unsubscribe | null = null;

  // Fetch fresh display names and colors from Firestore in a single pass
  function refreshMemberNames() {
    const uids = group.members.map(m => m.uid);
    Promise.all(uids.map(uid => getUserRecord(uid))).then(records => {
      memberNameMap = {};
      memberColorMap = {};
      uids.forEach((uid, i) => {
        const r = records[i];
        if (r?.displayName) memberNameMap[uid] = r.displayName;
        if (r?.color) memberColorMap[uid] = r.color;
      });
      profilesReady = true;
      render();
    }).catch(console.error);
  }

  function openRenameModal() {
    const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
    renderRenameModal(modalRoot, group, async (newName) => {
      await updateGroupName(group.id, newName);
      group = { ...group, name: newName };
      modalRoot.innerHTML = '';
      render();
    }, () => { modalRoot.innerHTML = ''; });
  }

  function render() {
    const paidByMap: Record<string, string> = {};
    group.members.forEach(m => (paidByMap[m.uid] = memberNameMap[m.uid] ?? m.displayName));

    container.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <button class="btn btn-ghost back-btn" id="back-btn">← Groups</button>
          <div class="group-title-row">
            <h1 class="app-brand group-title">${escapeHtml(group.name)}</h1>
          </div>
          <div class="header-actions">
            <button class="btn btn-secondary" id="invite-btn">+ Invite</button>
            <button class="btn btn-primary" id="add-expense-btn">+ Expense</button>
          </div>
        </header>

        <main class="main-content">
          <div id="settlement-root"></div>

          <div class="section-header">
            <h2>Members</h2>
          </div>
          <div class="member-chips">
            ${group.members.map(m => {
              const name = memberNameMap[m.uid] ?? m.displayName;
              const involved = expenses.some(e => e.paidBy === m.uid || e.splitBetween.includes(m.uid));
              const canRemove = !involved && m.uid !== user!.uid;
              return `<div class="member-chip">
                <div class="member-chip-avatar" style="background:${avatarColor(m.uid, memberColorMap)}">${escapeHtml(name[0].toUpperCase())}</div>
                <span class="member-chip-name">${escapeHtml(name)}</span>
                ${canRemove ? `<button class="member-chip-remove" data-uid="${m.uid}" title="Remove from group">&times;</button>` : ''}
              </div>`;
            }).join('')}
          </div>

          <div class="tab-bar" style="margin-top:16px">
            <button class="tab-btn${activeTab === 'expenses' ? ' active' : ''}" id="tab-expenses">Expenses</button>
            <button class="tab-btn${activeTab === 'history' ? ' active' : ''}" id="tab-history">History</button>
          </div>

          <div id="tab-expenses-panel" ${activeTab !== 'expenses' ? 'hidden' : ''}>
            <div class="expense-filters">
              <input id="expense-search" class="input input-sm" type="search"
                placeholder="Search expenses…" value="${escapeHtml(searchQuery)}" />
              <select id="expense-filter-payer" class="input input-sm">
                <option value="">All payers</option>
                ${group.members.map(m => {
                  const name = memberNameMap[m.uid] ?? m.displayName;
                  return `<option value="${m.uid}"${filterPaidBy === m.uid ? ' selected' : ''}>${escapeHtml(name)}</option>`;
                }).join('')}
              </select>
            </div>
            <div id="expense-list-root"></div>
          </div>

          <div id="tab-history-panel" ${activeTab !== 'history' ? 'hidden' : ''}>
            <div id="history-root"></div>
          </div>
        </main>

        <div id="modal-root"></div>
      </div>
    `;

    // Expense items (also called on filter changes)
    function renderExpenseItems() {
      const q = searchQuery.toLowerCase();
      const filtered = expenses.filter(exp => {
        const matchSearch = !q || exp.description.toLowerCase().includes(q);
        const matchPayer = !filterPaidBy || exp.paidBy === filterPaidBy;
        return matchSearch && matchPayer;
      });

      const root = container.querySelector<HTMLElement>('#expense-list-root')!;
      if (expenses.length === 0) {
        root.innerHTML = '<div class="empty-state"><p>No expenses yet. Add one to get started!</p></div>';
        return;
      }
      if (filtered.length === 0) {
        root.innerHTML = '<div class="empty-state"><p>No expenses match your search.</p></div>';
        return;
      }

      root.innerHTML = `
        <ul class="expense-list">
          ${filtered.map(exp => {
            const payerName = paidByMap[exp.paidBy] ?? exp.paidBy;
            const isSettlement = exp.description === 'Settlement payment';
            return `
            <li class="expense-item${isSettlement ? ' expense-item-settlement' : ''}">
              <div class="expense-avatar" style="background:${avatarColor(exp.paidBy, memberColorMap)}">
                ${escapeHtml(payerName[0].toUpperCase())}
              </div>
              <div class="expense-info">
                <span class="expense-desc">${escapeHtml(exp.description)}</span>
                <span class="expense-meta">
                  Paid by ${escapeHtml(payerName)}
                  &mdash; split ${exp.splitBetween.length} way${exp.splitBetween.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div class="expense-right">
                <span class="expense-amount">${formatCents(exp.amount)}</span>
                <button class="btn-icon expense-edit" data-id="${exp.id}" title="Edit">✎</button>
                <button class="btn btn-danger btn-sm expense-delete" data-id="${exp.id}">✕</button>
              </div>
            </li>`;
          }).join('')}
        </ul>
      `;

      root.querySelectorAll('.expense-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id!;
          const exp = expenses.find(e => e.id === id)!;
          const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
          renderExpenseForm(modalRoot, group, user!, () => { modalRoot.innerHTML = ''; }, exp);
        });
      });

      root.querySelectorAll('.expense-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!;
          if (confirm('Delete this expense?')) {
            const exp = expenses.find(e => e.id === id);
            await deleteExpense(group.id, id);
            if (exp) writeLog(group.id, {
              groupId: group.id,
              action: 'deleted',
              expenseDescription: exp.description,
              amountCents: exp.amount,
              actorUid: user!.uid,
              actorName: user!.displayName,
            }).catch(console.error);
          }
        });
      });
    }

    function renderHistoryItems() {
      const root = container.querySelector<HTMLElement>('#history-root');
      if (!root) return;
      if (logs.length === 0) {
        root.innerHTML = '<div class="empty-state"><p>No history yet.</p></div>';
        return;
      }
      root.innerHTML = `
        <ul class="log-list">
          ${logs.map(entry => {
            const color = memberColorMap[entry.actorUid] ?? avatarColor(entry.actorUid, memberColorMap);
            const actionLabel = entry.action === 'added' ? 'Added' : entry.action === 'edited' ? 'Edited' : 'Deleted';
            const actionClass = entry.action === 'deleted' ? 'log-action-deleted' : entry.action === 'edited' ? 'log-action-edited' : 'log-action-added';
            const time = formatRelativeTime(entry.createdAt);
            return `
              <li class="log-item">
                <div class="expense-avatar" style="background:${color}">${escapeHtml(entry.actorName[0].toUpperCase())}</div>
                <div class="log-info">
                  <span class="log-desc">
                    <span class="log-action ${actionClass}">${actionLabel}</span>
                    "${escapeHtml(entry.expenseDescription)}"
                    <span class="log-amount">${formatCents(entry.amountCents)}</span>
                  </span>
                  <span class="log-meta">${escapeHtml(entry.actorName)} &middot; ${time}</span>
                </div>
              </li>`;
          }).join('')}
        </ul>
      `;
    }

    renderExpenseItems();
    renderHistoryItems();

    container.querySelector('#tab-expenses')!.addEventListener('click', () => {
      activeTab = 'expenses';
      container.querySelector('#tab-expenses')!.classList.add('active');
      container.querySelector('#tab-history')!.classList.remove('active');
      container.querySelector<HTMLElement>('#tab-expenses-panel')!.removeAttribute('hidden');
      container.querySelector<HTMLElement>('#tab-history-panel')!.setAttribute('hidden', '');
    });

    container.querySelector('#tab-history')!.addEventListener('click', () => {
      activeTab = 'history';
      container.querySelector('#tab-history')!.classList.add('active');
      container.querySelector('#tab-expenses')!.classList.remove('active');
      container.querySelector<HTMLElement>('#tab-history-panel')!.removeAttribute('hidden');
      container.querySelector<HTMLElement>('#tab-expenses-panel')!.setAttribute('hidden', '');
    });

    container.querySelector('#expense-search')!.addEventListener('input', e => {
      searchQuery = (e.target as HTMLInputElement).value;
      renderExpenseItems();
    });

    container.querySelector('#expense-filter-payer')!.addEventListener('change', e => {
      filterPaidBy = (e.target as HTMLSelectElement).value;
      renderExpenseItems();
    });

    // Settlement view
    const settlementRoot = container.querySelector<HTMLElement>('#settlement-root')!;
    const displayGroup = {
      ...group,
      members: group.members.map(m => ({ ...m, displayName: memberNameMap[m.uid] ?? m.displayName })),
    };
    if (expenses.length > 0) {
      renderSettlementView(settlementRoot, displayGroup, expenses, onSettlementConfirmed, openRenameModal);
    }

    container.querySelectorAll<HTMLButtonElement>('.member-chip-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid!;
        const member = group.members.find(m => m.uid === uid);
        if (!member) return;
        btn.disabled = true;
        try {
          await removeMemberFromGroup(group.id, member);
        } catch (err) {
          console.error(err);
          btn.disabled = false;
        }
      });
    });

    container.querySelector('#back-btn')!.addEventListener('click', () =>
      navigate({ name: 'groups' })
    );

    container.querySelector('#add-expense-btn')!.addEventListener('click', () => {
      const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
      renderExpenseForm(modalRoot, group, user!, () => { modalRoot.innerHTML = ''; });
    });


    container.querySelector('#invite-btn')!.addEventListener('click', () => {
      const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
      renderInviteModal(modalRoot, group, () => { modalRoot.innerHTML = ''; });
    });

  }

  async function onSettlementConfirmed(from: string, to: string, amount: number): Promise<void> {
    await addExpense(group.id, 'Settlement payment', amount, from, [to]);
  }

  unsubGroup = subscribeToGroup(initialGroup.id, updatedGroup => {
    if (!updatedGroup) return;
    group = updatedGroup;
    refreshMemberNames();
  });

  unsubExpenses = subscribeToExpenses(group.id, newExpenses => {
    expenses = newExpenses;
    if (profilesReady) render();
  });

  unsubLogs = subscribeToLogs(group.id, newLogs => {
    logs = newLogs;
    if (profilesReady) {
      const root = container.querySelector<HTMLElement>('#history-root');
      if (root) {
        // Re-render only history list when already mounted
        render();
      }
    }
  });

  refreshMemberNames();

  return () => { unsubGroup?.(); unsubExpenses?.(); unsubLogs?.(); };
}

function renderRenameModal(
  container: HTMLElement,
  group: Group,
  onSave: (name: string) => Promise<void>,
  onClose: () => void
): void {
  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>Rename Group</h3>
          <button class="btn-close" id="modal-close">&times;</button>
        </div>
        <form id="rename-form" class="modal-body">
          <div class="form-field">
            <label for="group-name-input">Group name</label>
            <input id="group-name-input" type="text" class="input" value="${escapeHtml(group.name)}" maxlength="80" required autofocus />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#modal-close')!.addEventListener('click', onClose);
  container.querySelector('#cancel-btn')!.addEventListener('click', onClose);
  container.querySelector('#modal-overlay')!.addEventListener('click', e => {
    if (e.target === container.querySelector('#modal-overlay')) onClose();
  });

  container.querySelector('#rename-form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const newName = (container.querySelector<HTMLInputElement>('#group-name-input')!).value.trim();
    if (!newName || newName === group.name) { onClose(); return; }
    const btn = container.querySelector<HTMLButtonElement>('[type="submit"]')!;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await onSave(newName);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}

function renderInviteModal(container: HTMLElement, group: Group, onClose: () => void): void {
  const { user, groups } = store.getState();

  // Track all UIDs already in the group (or added this session) to prevent duplicates
  const addedUids = new Set(group.members.map(m => m.uid));

  // Build contacts: unique members across all groups, excluding current user and current group members
  const currentGroupUids = addedUids;
  const seen = new Set<string>();
  const contacts: { uid: string; displayName: string }[] = [];
  for (const g of groups) {
    for (const m of g.members) {
      if (!seen.has(m.uid) && m.uid !== user?.uid && !currentGroupUids.has(m.uid)) {
        seen.add(m.uid);
        contacts.push({ uid: m.uid, displayName: m.displayName });
      }
    }
  }

  const contactsHtml = contacts.length === 0 ? '' : `
    <div class="contact-history">
      <p class="contact-history-label">Previously added</p>
      <ul class="contact-list">
        ${contacts.map(c => `
          <li class="contact-item" data-uid="${c.uid}">
            <div class="contact-avatar">${escapeHtml(c.displayName[0].toUpperCase())}</div>
            <span class="contact-name">${escapeHtml(c.displayName)}</span>
            <button class="btn btn-secondary btn-sm contact-add-btn" data-uid="${c.uid}">Add</button>
          </li>
        `).join('')}
      </ul>
    </div>
    <div class="contact-divider">or add by email / ID</div>
  `;

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>Invite Member</h3>
          <button class="btn-close" id="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${contactsHtml}
          <div class="form-field">
            <label for="invite-email">Email address or User ID</label>
            <input id="invite-email" type="text" class="input" placeholder="friend@example.com or their ID" ${contacts.length === 0 ? 'autofocus' : ''} />
          </div>
          <div id="invite-error" class="auth-error" hidden></div>
          <div id="invite-success" class="invite-success" hidden></div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="invite-submit">Add Member</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const close = () => onClose();
  container.querySelector('#modal-close')!.addEventListener('click', close);
  container.querySelector('#cancel-btn')!.addEventListener('click', close);
  container.querySelector('#modal-overlay')!.addEventListener('click', e => {
    if (e.target === container.querySelector('#modal-overlay')) close();
  });

  // Quick-add from contacts history
  container.querySelectorAll<HTMLButtonElement>('.contact-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid!;
      const errorEl = container.querySelector<HTMLElement>('#invite-error')!;
      const successEl = container.querySelector<HTMLElement>('#invite-success')!;
      errorEl.hidden = true;
      successEl.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Adding…';
      try {
        const record = await getUserRecord(uid);
        if (!record) { btn.disabled = false; btn.textContent = 'Add'; return; }
        if (addedUids.has(record.uid)) {
          errorEl.textContent = `${record.displayName} is already in the group.`;
          errorEl.hidden = false;
          btn.closest<HTMLElement>('.contact-item')!.remove();
          return;
        }
        await addMemberToGroup(group.id, { uid: record.uid, displayName: record.displayName });
        addedUids.add(record.uid);
        btn.closest<HTMLElement>('.contact-item')!.remove();
        successEl.textContent = `${record.displayName} has been added to the group!`;
        successEl.hidden = false;
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to add member. Please try again.';
        errorEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Add';
      }
    });
  });

  container.querySelector('#invite-submit')!.addEventListener('click', async () => {
    const email = (container.querySelector<HTMLInputElement>('#invite-email')!).value.trim();
    const errorEl = container.querySelector<HTMLElement>('#invite-error')!;
    const successEl = container.querySelector<HTMLElement>('#invite-success')!;
    const submitBtn = container.querySelector<HTMLButtonElement>('#invite-submit')!;

    errorEl.hidden = true;
    successEl.hidden = true;

    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Looking up…';

    try {
      const isEmail = email.includes('@');
      const record = isEmail
        ? await getUserByEmail(email)
        : await getUserRecord(email);

      if (!record) {
        errorEl.textContent = isEmail
          ? 'No account found with that email. They need to sign up first.'
          : 'No account found with that ID. Check the ID and try again.';
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Member';
        return;
      }

      if (addedUids.has(record.uid)) {
        errorEl.textContent = `${record.displayName} is already in the group.`;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Member';
        return;
      }

      await addMemberToGroup(group.id, { uid: record.uid, displayName: record.displayName });
      addedUids.add(record.uid);
      successEl.textContent = `${record.displayName} has been added to the group!`;
      successEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Another';
      (container.querySelector<HTMLInputElement>('#invite-email')!).value = '';
      // Remove from contacts list if present
      container.querySelector<HTMLElement>(`.contact-item[data-uid="${record.uid}"]`)?.remove();
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Failed to add member. Please try again.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Member';
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
