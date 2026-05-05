import type { GameState, Action } from "../engine/types";
import { reduce } from "../engine/state";
import { setupGame } from "../engine/setup";

export interface Replay {
  seed: string;
  playerCount: number;
  actions: Action[];
  snapshots: GameState[]; // state after each action
}

export function createReplay(
  seed: string,
  playerCount: number,
  actions: Action[]
): Replay {
  let state = setupGame(seed, playerCount);
  const snapshots: GameState[] = [state];

  for (const action of actions) {
    try {
      state = reduce(state, action);
      snapshots.push(state);
    } catch (e) {
      console.warn("Replay action failed:", e);
      break;
    }
  }

  return { seed, playerCount, actions, snapshots };
}

export function replayToIndex(replay: Replay, index: number): GameState {
  if (index < 0) return replay.snapshots[0];
  if (index >= replay.snapshots.length) return replay.snapshots[replay.snapshots.length - 1];
  return replay.snapshots[index];
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(
    {
      version: 1,
      seed: replay.seed,
      playerCount: replay.playerCount,
      actions: replay.actions,
    },
    null,
    2
  );
}

export function deserializeReplay(json: string): Replay {
  const data = JSON.parse(json);
  return createReplay(data.seed, data.playerCount, data.actions);
}

export class ReplayPlayer {
  private replay: Replay;
  private currentIndex: number;
  private speed: number; // ms per step
  private playing: boolean;
  private timer: ReturnType<typeof setInterval> | null;
  private onUpdate: (state: GameState, index: number, total: number) => void;

  constructor(
    replay: Replay,
    onUpdate: (state: GameState, index: number, total: number) => void
  ) {
    this.replay = replay;
    this.currentIndex = 0;
    this.speed = 1000;
    this.playing = false;
    this.timer = null;
    this.onUpdate = onUpdate;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.timer = setInterval(() => {
      if (this.currentIndex >= this.replay.snapshots.length - 1) {
        this.pause();
        return;
      }
      this.currentIndex++;
      this.emit();
    }, this.speed);
  }

  pause(): void {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stepForward(): void {
    if (this.currentIndex < this.replay.snapshots.length - 1) {
      this.currentIndex++;
      this.emit();
    }
  }

  stepBackward(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.emit();
    }
  }

  seekTo(index: number): void {
    this.currentIndex = Math.max(0, Math.min(index, this.replay.snapshots.length - 1));
    this.emit();
  }

  setSpeed(ms: number): void {
    this.speed = ms;
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getIndex(): number {
    return this.currentIndex;
  }

  getTotal(): number {
    return this.replay.snapshots.length;
  }

  dispose(): void {
    this.pause();
  }

  private emit(): void {
    this.onUpdate(
      this.replay.snapshots[this.currentIndex],
      this.currentIndex,
      this.replay.snapshots.length
    );
  }
}
