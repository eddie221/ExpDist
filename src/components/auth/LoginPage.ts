import { signIn, signUp } from '../../services/auth.service.js';

export function renderLoginPage(container: HTMLElement): void {
  let mode: 'login' | 'signup' = 'login';

  function render() {
    const isSignup = mode === 'signup';
    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
              <rect width="48" height="48" rx="12" fill="var(--color-primary)"/>
              <text x="24" y="32" text-anchor="middle" font-size="24" fill="white" font-family="sans-serif">$</text>
            </svg>
          </div>
          <h1 class="login-title">ExpDist</h1>
          <p class="login-subtitle">Split expenses with friends, simplified.</p>

          <form id="auth-form" class="auth-form">
            ${isSignup ? `
              <input class="input" id="display-name" type="text" placeholder="Your name" required autocomplete="name" />
            ` : ''}
            <input class="input" id="email" type="email" placeholder="Email" required autocomplete="email" />
            <input class="input" id="password" type="password" placeholder="Password" required autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="6" />
            <div id="auth-error" class="auth-error" hidden></div>
            <button type="submit" class="btn btn-primary btn-full">
              ${isSignup ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p class="auth-toggle">
            ${isSignup
              ? 'Already have an account? <button class="btn-link" id="toggle-mode">Sign in</button>'
              : 'No account? <button class="btn-link" id="toggle-mode">Create one</button>'
            }
          </p>
        </div>
      </div>
    `;

    container.querySelector('#toggle-mode')!.addEventListener('click', () => {
      mode = isSignup ? 'login' : 'signup';
      render();
    });

    container.querySelector('#auth-form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const email = (form.querySelector('#email') as HTMLInputElement).value.trim();
      const password = (form.querySelector('#password') as HTMLInputElement).value;
      const errorEl = form.querySelector<HTMLElement>('#auth-error')!;
      const submitBtn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;

      errorEl.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait…';

      try {
        if (isSignup) {
          const name = (form.querySelector('#display-name') as HTMLInputElement).value.trim();
          await signUp(email, password, name);
        } else {
          await signIn(email, password);
        }
      } catch (err: unknown) {
        const msg = friendlyError(err);
        errorEl.textContent = msg;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
      }
    });
  }

  render();
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':  return 'That email is already registered. Try signing in.';
    case 'auth/invalid-email':         return 'Invalid email address.';
    case 'auth/weak-password':         return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':    return 'Incorrect email or password.';
    default:                           return 'Something went wrong. Please try again.';
  }
}
