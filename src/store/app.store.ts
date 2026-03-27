import type { User, Group, Expense } from '../types/index.js';

interface AppState {
  user: User | null;
  groups: Group[];
  currentGroup: Group | null;
  expenses: Expense[];
  loading: boolean;
  error: string | null;
}

type Listener = () => void;

function createStore() {
  let state: AppState = {
    user: null,
    groups: [],
    currentGroup: null,
    expenses: [],
    loading: false,
    error: null,
  };

  const listeners = new Set<Listener>();

  function notify() {
    listeners.forEach(fn => fn());
  }

  return {
    getState(): AppState {
      return state;
    },
    setState(partial: Partial<AppState>) {
      state = { ...state, ...partial };
      notify();
    },
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const store = createStore();
