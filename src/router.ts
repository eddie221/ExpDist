import type { Route } from './types/index.js';

type RouteHandler = (route: Route) => void;

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/' || path === '/groups') return { name: 'groups' };
  if (path === '/login') return { name: 'login' };
  if (path === '/profile') return { name: 'profile' };

  const groupMatch = path.match(/^\/groups\/([^/]+)$/);
  if (groupMatch) return { name: 'group', id: groupMatch[1] };

  return { name: 'not-found' };
}

export function navigate(route: Route): void {
  switch (route.name) {
    case 'login':
      window.location.hash = '/login';
      break;
    case 'groups':
      window.location.hash = '/groups';
      break;
    case 'group':
      window.location.hash = `/groups/${route.id}`;
      break;
    case 'profile':
      window.location.hash = '/profile';
      break;
    default:
      window.location.hash = '/';
  }
}

export function initRouter(handler: RouteHandler): () => void {
  const onHashChange = () => handler(parseHash(window.location.hash));
  window.addEventListener('hashchange', onHashChange);
  // Fire immediately for the current hash
  handler(parseHash(window.location.hash));
  return () => window.removeEventListener('hashchange', onHashChange);
}
