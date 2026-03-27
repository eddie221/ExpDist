import { store } from '../../store/app.store.js';
import { subscribeToGroups, deleteGroup } from '../../services/group.service.js';
import { navigate } from '../../router.js';
import { signOut } from '../../services/auth.service.js';
import { renderGroupCreate } from './GroupCreate.js';
import type { Unsubscribe } from 'firebase/firestore';

export function renderGroupList(container: HTMLElement): () => void {
  const { user } = store.getState();
  if (!user) return () => {};

  let unsubGroups: Unsubscribe | null = null;

  function render() {
    const { groups, loading } = store.getState();

    container.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <h1 class="app-brand">ExpDist</h1>
          <div class="header-actions">
            <span class="user-name">${user!.displayName}</span>
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
                  <span class="group-members">${g.members.length} member${g.members.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="group-item-actions">
                  <button class="btn btn-secondary group-open" data-id="${g.id}">Open</button>
                  ${g.createdBy === user!.uid
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

    container.querySelector('#sign-out-btn')!.addEventListener('click', () => signOut());

    container.querySelector('#create-group-btn')!.addEventListener('click', () => {
      const modalRoot = container.querySelector<HTMLElement>('#modal-root')!;
      renderGroupCreate(modalRoot, user!, () => { modalRoot.innerHTML = ''; });
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

  store.setState({ loading: true });
  unsubGroups = subscribeToGroups(user.uid, groups => {
    store.setState({ groups, loading: false });
    render();
  });

  render();

  return () => { unsubGroups?.(); };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
