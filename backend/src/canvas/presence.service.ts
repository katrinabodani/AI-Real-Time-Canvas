import { Injectable } from '@nestjs/common';
import type { Peer } from '@canvas/shared';

const NAMES = [
  'Maya', 'Leo', 'Ada', 'Kai', 'Zoe', 'Ravi', 'Nina', 'Omar',
  'Lia', 'Theo', 'Iris', 'Niko', 'Suki', 'Hugo', 'Mira', 'Dev',
];

function hash(input: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

/** Identity is derived deterministically from the stable clientId, so the same
 *  tab keeps the same name + color across reconnects and even server restarts. */
function identityFor(clientId: string): { name: string; color: string } {
  const name = NAMES[hash(clientId, 7) % NAMES.length];
  const hue = hash(clientId, 131) % 360;
  return { name, color: `hsl(${hue}, 75%, 55%)` };
}

interface Entry {
  peer: Peer;
  /** The socket that currently owns this identity (for disconnect handling). */
  socketId: string;
}

/** Presence keyed by stable clientId (not the ephemeral socket id). */
@Injectable()
export class PresenceService {
  private readonly entries = new Map<string, Entry>();

  /** Register/refresh a client. `isNew` is false on reconnect (identity reused). */
  add(clientId: string, socketId: string): { peer: Peer; isNew: boolean } {
    const existing = this.entries.get(clientId);
    if (existing) {
      existing.socketId = socketId;
      return { peer: existing.peer, isNew: false };
    }
    const { name, color } = identityFor(clientId);
    const peer: Peer = { id: clientId, name, color, cursor: null, selection: null };
    this.entries.set(clientId, { peer, socketId });
    return { peer, isNew: true };
  }

  /** Remove a client only if the disconnecting socket still owns it (guards
   *  against a stale disconnect firing after a reconnect took the identity). */
  removeBySocket(socketId: string): string | null {
    for (const [clientId, entry] of this.entries) {
      if (entry.socketId === socketId) {
        this.entries.delete(clientId);
        return clientId;
      }
    }
    return null;
  }

  setCursor(clientId: string, x: number, y: number): void {
    const entry = this.entries.get(clientId);
    if (entry) entry.peer.cursor = { x, y };
  }

  setSelection(clientId: string, nodeId: string | null): void {
    const entry = this.entries.get(clientId);
    if (entry) entry.peer.selection = nodeId;
  }

  list(excludeClientId?: string): Peer[] {
    const peers: Peer[] = [];
    for (const [clientId, entry] of this.entries) {
      if (clientId !== excludeClientId) peers.push(entry.peer);
    }
    return peers;
  }
}
