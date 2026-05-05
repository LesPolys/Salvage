import type { GameState, Action } from "../engine/types";

export interface SaveFile {
  version: 1;
  timestamp: number;
  seed: string;
  state: GameState;
}

export interface ReplayFile {
  version: 1;
  timestamp: number;
  seed: string;
  playerCount: number;
  actions: Action[];
}

export function saveGame(state: GameState): string {
  const save: SaveFile = {
    version: 1,
    timestamp: Date.now(),
    seed: state.meta.seed,
    state,
  };
  return JSON.stringify(save, null, 2);
}

export function loadGame(json: string): GameState {
  const save = JSON.parse(json) as SaveFile;
  if (save.version !== 1) throw new Error(`Unknown save version: ${save.version}`);
  return save.state;
}

export function saveToLocalStorage(key: string, state: GameState): void {
  try {
    localStorage.setItem(key, saveGame(state));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

export function loadFromLocalStorage(key: string): GameState | null {
  try {
    const json = localStorage.getItem(key);
    if (!json) return null;
    return loadGame(json);
  } catch (e) {
    console.error("Failed to load from localStorage:", e);
    return null;
  }
}

export function listSaves(): string[] {
  const saves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("salvage-save-")) {
      saves.push(key);
    }
  }
  return saves.sort().reverse();
}

export function deleteSave(key: string): void {
  localStorage.removeItem(key);
}
