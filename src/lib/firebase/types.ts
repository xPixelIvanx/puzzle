import type { ImageStorageKind } from "./config";

export type GameMode = "coop" | "versus";

export interface RoomInfo {
  createdBy: string;
  createdAt: number;
  maxPlayers: number;
}

export interface Member {
  name: string;
  color: string;
  slot: number;
  joinedAt: number;
}

export interface Presence {
  on: boolean;
  at: number;
}

export interface PuzzleRecord {
  id: string;
  mode: GameMode;
  image: { id: string; storage: ImageStorageKind; w: number; h: number };
  cols: number;
  rows: number;
  seed: number;
  rotate: boolean;
  by: string;
  at: number;
  elapsed?: number;
  done?: number;
}

export interface ChatMessage {
  id: string;
  u: string;
  n: string;
  c: string;
  t: string;
  at: number;
}

export interface Round {
  n: number;
  seed: number;
  at?: number;
  by: string;
  winner?: string;
}

export interface Progress {
  n: number;
  joined: number;
  moves: number;
  done?: number;
}
