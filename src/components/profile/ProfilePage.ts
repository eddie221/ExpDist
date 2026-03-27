import { store } from '../../store/app.store.js';
import { navigate } from '../../router.js';
import { updateDisplayName } from '../../services/user.service.js';

export function renderProfilePage(container: HTMLElement): void {
  function render(saving = false, saved = false, error = '') {
    const { user } = store.getState();
    if (!user) return;
    container.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <button class="btn btn-ghost" id="back-btn">← Groups</button>
          <h1 class="app-brand">Profile</h1>
        </header>

        <main class="main-content">
          <div class="profile-card">
            <div class="profile-avatar">${escapeHtml(user!.displayName.charAt(0).toUpperCase())}</div>
            <h2 class="profile-name">${escapeHtml(user!.displayName)}</h2>

            <div class="profile-fields">
              <div class="profile-field">
                <span class="profile-label">Email</span>
                <span class="profile-value">${escapeHtml(user!.email ?? '—')}</span>
              </div>

              <div class="profile-field">
                <span class="profile-label">Your ID</span>
                <div class="profile-id-row">
                  <span class="profile-value profile-id" id="uid-text">${escapeHtml(user!.uid)}</span>
                  <button class="btn btn-ghost btn-sm" id="copy-uid">Copy</button>
                </div>
                <span class="profile-hint">Share this ID so others can add you to a group.</span>
              </div>

              <div class="profile-field">
                <span class="profile-label">Username</span>
                <form id="username-form" class="username-form">
                  <input
                    id="username-input"
                    type="text"
                    class="input"
                    value="${escapeHtml(user!.displayName)}"
                    maxlength="50"
                    required
                  />
                  ${error ? `<span class="auth-error">${escapeHtml(error)}</span>` : ''}
                  ${saved ? `<span class="invite-success">Username updated!</span>` : ''}
                  <div class="username-actions">
                    <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                      ${saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    container.querySelector('#back-btn')!.addEventListener('click', () =>
      navigate({ name: 'groups' })
    );

    container.querySelector('#copy-uid')!.addEventListener('click', () => {
      navigator.clipboard.writeText(user!.uid).then(() => {
        const btn = container.querySelector<HTMLButtonElement>('#copy-uid')!;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    });

    container.querySelector('#username-form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = store.getState().user!;
      const newName = (container.querySelector<HTMLInputElement>('#username-input')!).value.trim();
      if (!newName || newName === currentUser.displayName) return;

      render(true, false, '');
      try {
        await updateDisplayName(currentUser.uid, newName);
        store.setState({ user: { ...currentUser, displayName: newName } });
        render(false, true, '');
      } catch (err) {
        console.error(err);
        render(false, false, 'Failed to update username. Please try again.');
      }
    });
  }

  render();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
