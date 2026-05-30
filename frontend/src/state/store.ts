import { create } from 'zustand';
import type { CanvasNode, LockMap, Peer } from '@canvas/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
/** Generation strategy. LLM-only. */
export type GenMode = 'llm';

/** The structured output of the most recent generation, for inspection.
 *  `raw` is the LLM's {nodes:[...]} JSON. */
export interface LastGeneration {
  source: string;
  raw: unknown;
}

export interface Toast {
  id: number;
  text: string;
  color: string;
}

interface CanvasStore {
  nodes: CanvasNode[];
  /** nodeId -> socketId that holds the lock (only other users' locks matter). */
  locks: LockMap;
  myId: string | null;
  /** My own stable identity (name + color), or null until presence:init. */
  me: Peer | null;
  /** Other connected users, keyed by clientId (excludes me). */
  peers: Record<string, Peer>;
  toasts: Toast[];
  status: ConnectionStatus;
  error: string | null;
  generating: boolean;
  /** Locally selected shape (UI only — not synced). */
  selectedId: string | null;
  /** Snap dragged shapes to the grid (local UI preference). */
  snapToGrid: boolean;
  /** Which generation strategy the server should use. The UI uses LLM only. */
  genMode: GenMode;
  /** Structured output of the most recent generation (intent + source). */
  lastGeneration: LastGeneration | null;

  setSnapshot: (nodes: CanvasNode[], locks: LockMap) => void;
  setGenerated: (nodes: CanvasNode[], source?: string, raw?: unknown) => void;
  applyMoved: (id: string, x: number, y: number) => void;
  setLocked: (id: string, by: string) => void;
  setUnlocked: (id: string) => void;

  setPresenceInit: (me: Peer, peers: Peer[]) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (id: string) => void;
  setPeerCursor: (id: string, x: number, y: number) => void;
  setPeerSelection: (id: string, nodeId: string | null) => void;
  dismissToast: (id: number) => void;

  setSelected: (id: string | null) => void;
  setSnapToGrid: (snap: boolean) => void;

  setStatus: (status: ConnectionStatus) => void;
  setMyId: (id: string | null) => void;
  setError: (error: string | null) => void;
  setGenerating: (generating: boolean) => void;
}

let toastSeq = 0;
function pushToast(toasts: Toast[], text: string, color: string): Toast[] {
  return [...toasts, { id: ++toastSeq, text, color }].slice(-4);
}

const SNAP_KEY = 'canvas-snap-to-grid';

function loadSnapToGrid(): boolean {
  try {
    return localStorage.getItem(SNAP_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistSnapToGrid(value: boolean): void {
  try {
    localStorage.setItem(SNAP_KEY, String(value));
  } catch {
    // ignore (e.g. storage disabled)
  }
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  nodes: [],
  locks: {},
  myId: null,
  me: null,
  peers: {},
  toasts: [],
  status: 'connecting',
  error: null,
  generating: false,
  selectedId: null,
  snapToGrid: loadSnapToGrid(),
  genMode: 'llm',
  lastGeneration: null,

  setSnapshot: (nodes, locks) => set({ nodes, locks }),
  // A regenerated canvas invalidates every selection (old node ids are gone).
  setGenerated: (nodes, source, raw) =>
    set((s) => ({
      nodes,
      locks: {},
      error: null,
      selectedId: null,
      lastGeneration: source ? { source, raw } : s.lastGeneration,
      peers: Object.fromEntries(
        Object.entries(s.peers).map(([id, p]) => [id, { ...p, selection: null }]),
      ),
    })),

  applyMoved: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    })),

  setLocked: (id, by) => set((s) => ({ locks: { ...s.locks, [id]: by } })),
  setUnlocked: (id) =>
    set((s) => {
      const locks = { ...s.locks };
      delete locks[id];
      return { locks };
    }),

  setPresenceInit: (me, peers) =>
    set({
      me,
      myId: me.id,
      peers: Object.fromEntries(peers.map((p) => [p.id, p])),
    }),

  addPeer: (peer) =>
    set((s) => ({
      peers: { ...s.peers, [peer.id]: peer },
      toasts: pushToast(s.toasts, `${peer.name} joined`, peer.color),
    })),

  removePeer: (id) =>
    set((s) => {
      const peer = s.peers[id];
      const peers = { ...s.peers };
      delete peers[id];
      return {
        peers,
        toasts: peer
          ? pushToast(s.toasts, `${peer.name} left`, peer.color)
          : s.toasts,
      };
    }),

  setPeerCursor: (id, x, y) =>
    set((s) => {
      const peer = s.peers[id];
      if (!peer) return {};
      return { peers: { ...s.peers, [id]: { ...peer, cursor: { x, y } } } };
    }),

  setPeerSelection: (id, nodeId) =>
    set((s) => {
      const peer = s.peers[id];
      if (!peer) return {};
      return { peers: { ...s.peers, [id]: { ...peer, selection: nodeId } } };
    }),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSelected: (selectedId) => set({ selectedId }),
  setSnapToGrid: (snapToGrid) => {
    persistSnapToGrid(snapToGrid);
    set({ snapToGrid });
  },

  setStatus: (status) => set({ status }),
  setMyId: (myId) => set({ myId }),
  setError: (error) => set({ error }),
  setGenerating: (generating) => set({ generating }),
}));
