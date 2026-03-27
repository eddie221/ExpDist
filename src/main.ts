import './styles/main.css';
import { initAuth } from './services/auth.service.js';
import { getGroup } from './services/group.service.js';
import { store } from './store/app.store.js';
import { initRouter, navigate } from './router.js';
import { renderLoginPage } from './components/auth/LoginPage.js';
import { renderGroupList } from './components/groups/GroupList.js';
import { renderExpenseList } from './components/expenses/ExpenseList.js';
import { renderProfilePage } from './components/profile/ProfilePage.js';
import type { Route } from './types/index.js';

const appEl = document.getElementById('app')!;
let cleanupRoute: (() => void) | null = null;

function handleRoute(route: Route): void {
  const { user } = store.getState();

  // Auth guard
  if (!user && route.name !== 'login') {
    navigate({ name: 'login' });
    return;
  }
  if (user && route.name === 'login') {
    navigate({ name: 'groups' });
    return;
  }

  // Tear down previous route
  cleanupRoute?.();
  cleanupRoute = null;
  appEl.innerHTML = '';

  switch (route.name) {
    case 'login':
      renderLoginPage(appEl);
      break;

    case 'groups':
      cleanupRoute = renderGroupList(appEl);
      break;

    case 'group':
      (async () => {
        appEl.innerHTML = '<div class="spinner spinner-center"></div>';
        const group = await getGroup(route.id);
        if (!group) {
          appEl.innerHTML = '<div class="error-page"><p>Group not found.</p></div>';
          return;
        }
        cleanupRoute = renderExpenseList(appEl, group);
      })();
      break;

    case 'profile':
      renderProfilePage(appEl);
      break;

    default:
      appEl.innerHTML = '<div class="error-page"><h2>404 — Page not found</h2></div>';
  }
}

// Wait for Firebase Auth to resolve before rendering
initAuth(() => {
  store.subscribe(() => {
    // Re-evaluate the current route whenever auth state changes
    const hash = window.location.hash;
    const { user } = store.getState();

    if (!user && hash !== '#/login') {
      navigate({ name: 'login' });
    } else if (user && (hash === '#/login' || hash === '' || hash === '#/')) {
      navigate({ name: 'groups' });
    }
  });

  initRouter(handleRoute);
});
