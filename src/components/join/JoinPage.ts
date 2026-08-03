import { store } from '../../store/app.store.js';
import { getInvite } from '../../services/invite.service.js';
import { getGroup, joinGroupViaInvite } from '../../services/group.service.js';
import { navigate } from '../../router.js';

export function renderJoinPage(container: HTMLElement, token: string): () => void {
  let cancelled = false;

  container.innerHTML = '<div class="spinner spinner-center"></div>';

  (async () => {
    const invite = await getInvite(token);
    if (cancelled) return;
    if (!invite) {
      container.innerHTML = `
        <div class="error-page">
          <h2>Invite not valid</h2>
          <p>This invite link is invalid or has been removed.</p>
          <button class="btn btn-primary" id="home-btn">Go home</button>
        </div>
      `;
      container.querySelector('#home-btn')!.addEventListener('click', () => navigate({ name: 'groups' }));
      return;
    }

    const user = store.getState().user!;
    // Already a member? Skip straight to the group.
    const existing = await getGroup(invite.groupId).catch(() => null);
    if (existing && existing.memberUids.includes(user.uid)) {
      navigate({ name: 'group', id: invite.groupId });
      return;
    }

    container.innerHTML = `
      <div class="app-layout">
        <main class="main-content">
          <div class="join-card">
            <h2>You've been invited to join</h2>
            <p class="join-group-name">${escapeHtml(invite.groupName)}</p>
            <div id="join-error" class="auth-error" hidden></div>
            <div class="join-actions">
              <button class="btn btn-ghost" id="join-cancel">Cancel</button>
              <button class="btn btn-primary" id="join-accept">Accept &amp; join</button>
            </div>
          </div>
        </main>
      </div>
    `;

    container.querySelector('#join-cancel')!.addEventListener('click', () => navigate({ name: 'groups' }));
    container.querySelector('#join-accept')!.addEventListener('click', async () => {
      const btn = container.querySelector<HTMLButtonElement>('#join-accept')!;
      const err = container.querySelector<HTMLElement>('#join-error')!;
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Joining…';
      try {
        await joinGroupViaInvite(invite.groupId, token, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email ?? undefined,
        });
        navigate({ name: 'group', id: invite.groupId });
      } catch (e) {
        console.error(e);
        err.textContent = 'Failed to join. Please try again.';
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Accept & join';
      }
    });
  })().catch(e => {
    if (cancelled) return;
    console.error(e);
    container.innerHTML = '<div class="error-page"><p>Something went wrong loading this invite.</p></div>';
  });

  return () => { cancelled = true; };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
