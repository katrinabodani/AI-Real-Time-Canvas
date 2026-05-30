import { io, type Socket } from 'socket.io-client';
import {
  EVENTS,
  type CanvasStatePayload,
  type CursorMovedPayload,
  type GeneratedPayload,
  type GenerateAck,
  type LockAck,
  type LockedPayload,
  type MovedPayload,
  type PresenceInitPayload,
  type PresenceJoinPayload,
  type PresenceLeavePayload,
  type SelectionChangedPayload,
  type UnlockedPayload,
} from '@canvas/shared';
import { useCanvasStore } from './store';

const URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const MOVE_THROTTLE_MS = 33; // ~30 messages/sec during a drag

let socket: Socket | null = null;

/** Stable per-tab identity: survives reloads/reconnects (so the server keeps the
 *  same name + color) but is unique per tab (so multi-tab sync still works). */
function getClientId(): string {
  const KEY = 'canvas-client-id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Singleton socket client. It owns the connection and is the ONLY place server
 * events are translated into store actions — components never touch the socket
 * for reads, keeping the transport layer decoupled from the store.
 */
export function getSocket(): Socket {
  if (socket) return socket;
  const clientId = getClientId();
  socket = io(URL, { transports: ['websocket'], auth: { clientId } });
  const store = useCanvasStore.getState;

  socket.on('connect', () => {
    store().setMyId(clientId);
    store().setStatus('connected');
  });
  socket.on('disconnect', () => store().setStatus('disconnected'));
  socket.io.on('reconnect_attempt', () => store().setStatus('connecting'));

  socket.on(EVENTS.state, (p: CanvasStatePayload) =>
    store().setSnapshot(p.nodes, p.locks),
  );
  socket.on(EVENTS.generated, (p: GeneratedPayload) =>
    store().setGenerated(p.nodes, p.source, p.raw),
  );
  socket.on(EVENTS.moved, (p: MovedPayload) => store().applyMoved(p.id, p.x, p.y));
  socket.on(EVENTS.locked, (p: LockedPayload) => store().setLocked(p.id, p.by));
  socket.on(EVENTS.unlocked, (p: UnlockedPayload) => store().setUnlocked(p.id));

  socket.on(EVENTS.presenceInit, (p: PresenceInitPayload) =>
    store().setPresenceInit(p.me, p.peers),
  );
  socket.on(EVENTS.presenceJoin, (p: PresenceJoinPayload) => store().addPeer(p));
  socket.on(EVENTS.presenceLeave, (p: PresenceLeavePayload) =>
    store().removePeer(p.id),
  );
  socket.on(EVENTS.cursorMoved, (p: CursorMovedPayload) =>
    store().setPeerCursor(p.id, p.x, p.y),
  );
  socket.on(EVENTS.selectionChanged, (p: SelectionChangedPayload) =>
    store().setPeerSelection(p.id, p.nodeId),
  );

  return socket;
}

export async function generate(prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const store = useCanvasStore.getState();
  store.setGenerating(true);
  store.setError(null);
  try {
    const ack: GenerateAck = await getSocket().emitWithAck(EVENTS.generate, {
      prompt: trimmed,
      mode: store.genMode,
    });
    if (!ack?.ok) store.setError(ack?.error ?? 'Generation failed.');
  } catch {
    store.setError('Server did not respond. Is it running?');
  } finally {
    store.setGenerating(false);
  }
}

let lastMoveSent = 0;

/** Optimistic local update every frame; throttled emit to the server. */
export function moveNode(
  id: string,
  x: number,
  y: number,
  options?: { final?: boolean },
): void {
  useCanvasStore.getState().applyMoved(id, x, y);
  const now = performance.now();
  if (!options?.final && now - lastMoveSent < MOVE_THROTTLE_MS) return;
  lastMoveSent = now;
  getSocket().emit(EVENTS.move, { id, x, y });
}

/** Claim a node before dragging. Resolves to whether the lock was granted. */
export async function lockNode(id: string): Promise<boolean> {
  try {
    const ack: LockAck = await getSocket().emitWithAck(EVENTS.lock, { id });
    return Boolean(ack?.granted);
  } catch {
    return false;
  }
}

export function unlockNode(id: string): void {
  getSocket().emit(EVENTS.unlock, { id });
}

const CURSOR_THROTTLE_MS = 40; // ~25 updates/sec
let lastCursorSent = 0;

/** Emit my cursor in LOGICAL canvas coords so it lands on the same spot for
 *  everyone regardless of their screen size / stage scale. */
export function emitCursor(x: number, y: number): void {
  const now = performance.now();
  if (now - lastCursorSent < CURSOR_THROTTLE_MS) return;
  lastCursorSent = now;
  getSocket().emit(EVENTS.cursorMove, { x, y });
}

/** Broadcast my current selection (nodeId, or null to clear). */
export function emitSelection(nodeId: string | null): void {
  getSocket().emit(EVENTS.selectionSet, { nodeId });
}
