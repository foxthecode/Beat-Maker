import { useReducer, useEffect } from "react";

export interface AppState {
  launched: boolean;
  tipsShown: string[];
  lastTemplateId: string;
  lastBpm: number;
  usageSeconds: number;
  masterVol: number;
}

const KEY = "ks_state";

const DEFAULT: AppState = {
  launched: false,
  tipsShown: [],
  lastTemplateId: "",
  lastBpm: 90,
  usageSeconds: 0,
  masterVol: 80,
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT };
}

function save(s: AppState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

let _state: AppState = load();
const _listeners = new Set<() => void>();

function getState(): AppState { return _state; }

function patchState(next: Partial<AppState>) {
  _state = { ..._state, ...next };
  save(_state);
  _listeners.forEach(l => l());
}

export function useAppState() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    _listeners.add(rerender);
    return () => { _listeners.delete(rerender); };
  }, []);
  return {
    state: getState(),
    setLaunched: () => patchState({ launched: true }),
    markTipShown: (id: string) =>
      patchState({ tipsShown: [..._state.tipsShown.filter(t => t !== id), id] }),
    setLastTemplate: (id: string) => patchState({ lastTemplateId: id }),
    addUsageTime: (seconds: number) =>
      patchState({ usageSeconds: _state.usageSeconds + seconds }),
    setMasterVol: (v: number) => patchState({ masterVol: v }),
  };
}
