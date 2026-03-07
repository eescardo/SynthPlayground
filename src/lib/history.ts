export interface HistoryState<T> {
  current: T;
  past: T[];
  future: T[];
  lastActionKey?: string;
}

export const createHistory = <T>(initial: T): HistoryState<T> => ({
  current: structuredClone(initial),
  past: [],
  future: [],
  lastActionKey: undefined
});

export const pushHistory = <T>(
  state: HistoryState<T>,
  next: T,
  options?: { actionKey?: string; coalesce?: boolean }
): HistoryState<T> => {
  if (options?.coalesce && options.actionKey && state.lastActionKey === options.actionKey) {
    return {
      current: next,
      past: state.past,
      future: [],
      lastActionKey: options.actionKey
    };
  }

  return {
    current: next,
    past: [...state.past, state.current],
    future: [],
    lastActionKey: options?.actionKey
  };
};

export const undoHistory = <T>(state: HistoryState<T>): HistoryState<T> => {
  if (state.past.length === 0) {
    return state;
  }

  return {
    current: state.past[state.past.length - 1],
    past: state.past.slice(0, -1),
    future: [state.current, ...state.future],
    lastActionKey: undefined
  };
};

export const redoHistory = <T>(state: HistoryState<T>): HistoryState<T> => {
  if (state.future.length === 0) {
    return state;
  }

  return {
    current: state.future[0],
    past: [...state.past, state.current],
    future: state.future.slice(1),
    lastActionKey: undefined
  };
};
