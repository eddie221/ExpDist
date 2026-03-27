import { createGroup } from '../../services/group.service.js';
import type { User } from '../../types/index.js';

export function renderGroupCreate(
  container: HTMLElement,
  user: User,
  onClose: () => void
): void {
  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>Create a New Group</h3>
          <button class="btn-close" id="modal-close">&times;</button>
        </div>
        <form id="create-group-form" class="modal-body">
          <div class="form-field">
            <label for="group-name">Group Name</label>
            <input
              id="group-name"
              type="text"
              class="input"
              placeholder="e.g. Trip to Paris"
              maxlength="80"
              required
              autofocus
            />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Group</button>
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

  container.querySelector('#create-group-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = container.querySelector<HTMLInputElement>('#group-name')!;
    const name = input.value.trim();
    if (!name) return;

    const submitBtn = container.querySelector<HTMLButtonElement>('[type="submit"]')!;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    try {
      await createGroup(name, { uid: user.uid, displayName: user.displayName });
      close();
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Group';
    }
  });
}
