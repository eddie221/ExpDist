import { store } from '../../store/app.store.js';
import { subscribeToGroups, deleteGroup } from '../../services/group.service.js';
import { navigate } from '../../router.js';
import { signOut } from '../../services/auth.service.js';
import { renderGroupCreate } from './GroupCreate.js';
import type { Unsubscribe } from 'firebase/firestore';

export function renderGroupList(container: HTMLElement): () => void {
  let unsubGroups: Unsubscribe | null = null;

  function render() {
    const { user, groups, loading } = store.getState();
    if (!user) return;

    container.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <h1 class="app-brand">ExpDist</h1>
          <div class="header-actions">
            <button class="btn btn-ghost user-name" id="profile-btn">${user.displayName}</button>
            <button class="btn btn-ghost" id="sign-out-btn">Sign out</button>
          </div>
        </header>

        <main class="main-content">
          <div class="section-header">
            <h2>Your Groups</h2>
            <button class="btn btn-primary" id="create-group-btn">+ New Group</button>
          </div>

          ${loading ? '<div class="spinner"></div>' : ''}

          ${!loading && groups.length === 0
            ? '<div class="empty-state"><p>No groups yet. Create one to get started!</p></div>'
            : ''
          }

          <ul class="group-list">
            ${groups.map(g => `
              <li class="group-item" data-id="${g.id}">
                <div class="group-item-info">
                  <span class="group-name">${escapeHtml(g.name)}</span>
                  <span class="group-members">${memberSummary(g.members)}</span>
                </div>
                <div class="group-item-actions">
                  <button class="btn btn-secondary group-open" data-id="${g.id}">Open</button>
                  ${g.createdBy === user.uid
                    ? `<button class="btn btn-danger group-delete" data-id="${g.id}">Delete</button>`
                    : ''
                  }
                </div>
              </li>
            `).join('')}
          </ul>
        </main>

        <div id="modal-root"></div>
      </div>
    `;

    container.querySelector('#profile-btn')!.addEventListener('click', () => navigate({ name: 'profile' }));
    container.querySelector('#sign-out-btn')!.addEventListener('click', () => signOut());

    container.querySelector('#create-group-btn')!.addEventListener('click', () => {
      const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
      renderGroupCreate(modalRoot, user, () => { modalRoot.innerHTML = ''; });
    });

    container.querySelectorAll('.group-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        navigate({ name: 'group', id });
      });
    });

    container.querySelectorAll('.group-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm('Delete this group? This cannot be undone.')) {
          await deleteGroup(id);
        }
      });
    });
  }

  const initialUser = store.getState().user;
  if (!initialUser) return () => {};

  store.setState({ loading: true });
  unsubGroups = subscribeToGroups(initialUser.uid, groups => {
    store.setState({ groups, loading: false });
    render();
  });

  render();

  return () => { unsubGroups?.(); };
}

function memberSummary(members: { displayName: string }[]): string {
  const limit = 3;
  const names = members.slice(0, limit).map(m => escapeHtml(m.displayName));
  const rest = members.length - limit;
  return rest > 0
    ? `${names.join(', ')} and ${rest} more`
    : names.join(', ');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
