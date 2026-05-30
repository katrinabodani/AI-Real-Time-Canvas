import type { CanvasNode } from './canvas';

/** Socket.io event names. The first four are from the spec; the lock events
 *  and the init snapshot are additions for correctness/production thinking. */
export const EVENTS = {
  // spec events
  generate: 'canvas:generate',
  generated: 'canvas:generated',
  move: 'node:move',
  moved: 'node:moved',
  // init-on-connect snapshot (drives multi-tab sync + refresh persistence)
  state: 'canvas:state',
  // soft-locking
  lock: 'node:lock',
  locked: 'node:locked',
  unlock: 'node:unlock',
  unlocked: 'node:unlocked',
  // presence + live cursors
  presenceInit: 'presence:init',
  presenceJoin: 'presence:join',
  presenceLeave: 'presence:leave',
  cursorMove: 'cursor:move',
  cursorMoved: 'cursor:moved',
  // shared selection awareness
  selectionSet: 'selection:set',
  selectionChanged: 'selection:changed',
} as const;

/** Map of nodeId -> socketId holding the lock. */
export type LockMap = Record<string, string>;

export interface CanvasStatePayload {
  nodes: CanvasNode[];
  locks: LockMap;
}

/** How a generation request is fulfilled. LLM-only (requires an API key). */
export type GenerationMode = 'llm';

export interface GeneratePayload {
  prompt: string;
  mode?: GenerationMode;
}

/** Ack returned to the requester of `canvas:generate`. */
export interface GenerateAck {
  ok: boolean;
  error?: string;
}

export interface GeneratedPayload {
  nodes: CanvasNode[];
  /** Which engine produced it (currently always 'llm'). */
  source?: string;
  /** The raw structured output the engine returned, for inspection:
   *  the LLM's {nodes:[...]} JSON. */
  raw?: unknown;
}

export interface MovePayload {
  id: string;
  x: number;
  y: number;
}

export type MovedPayload = MovePayload;

export interface LockPayload {
  id: string;
}

/** Ack returned to the requester of `node:lock`. */
export interface LockAck {
  granted: boolean;
}

export interface LockedPayload {
  id: string;
  by: string;
}

export interface UnlockPayload {
  id: string;
}

export interface UnlockedPayload {
  id: string;
}

/** A participant, identified by a stable per-tab clientId (no auth). Cursor
 *  coords are in logical canvas space; `selection` is the node they highlight. */
export interface Peer {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selection?: string | null;
}

/** Sent to a joining socket: its own identity plus everyone already present. */
export interface PresenceInitPayload {
  me: Peer;
  peers: Peer[];
}

export type PresenceJoinPayload = Peer;

export interface PresenceLeavePayload {
  id: string;
}

export interface CursorMovePayload {
  x: number;
  y: number;
}

export interface CursorMovedPayload {
  id: string;
  x: number;
  y: number;
}

/** A client telling the server which node it has selected (or null to clear). */
export interface SelectionSetPayload {
  nodeId: string | null;
}

/** Broadcast of another player's current selection. */
export interface SelectionChangedPayload {
  id: string;
  nodeId: string | null;
}
