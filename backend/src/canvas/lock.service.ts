import { Injectable } from '@nestjs/common';
import type { LockMap } from '@canvas/shared';

/** Idle timeout: a lock auto-releases after this long with no movement. The
 *  real safety net is disconnect cleanup; this just covers missed unlocks. */
const STALE_MS = 10_000;

interface LockEntry {
  /** Stable clientId of the owner. */
  ownerId: string;
  timer: NodeJS.Timeout;
}

/** Soft-locking state, keyed by node id; ownership is by stable clientId. */
@Injectable()
export class LockService {
  private readonly locks = new Map<string, LockEntry>();

  /** Set by the gateway to broadcast an unlock when a stale lock expires. */
  onExpire: ((nodeId: string) => void) | null = null;

  /** Grant a lock if the node is free or already held by this owner. */
  tryLock(nodeId: string, ownerId: string): boolean {
    const existing = this.locks.get(nodeId);
    if (existing && existing.ownerId !== ownerId) return false;
    this.arm(nodeId, ownerId);
    return true;
  }

  /** Whether this owner is allowed to move the node (free or its own lock). */
  canMove(nodeId: string, ownerId: string): boolean {
    const entry = this.locks.get(nodeId);
    return !entry || entry.ownerId === ownerId;
  }

  /** Keep an owner's lock alive while it's actively dragging. */
  refresh(nodeId: string, ownerId: string): void {
    const entry = this.locks.get(nodeId);
    if (entry && entry.ownerId === ownerId) this.arm(nodeId, ownerId);
  }

  unlock(nodeId: string, ownerId: string): boolean {
    const entry = this.locks.get(nodeId);
    if (!entry || entry.ownerId !== ownerId) return false;
    clearTimeout(entry.timer);
    this.locks.delete(nodeId);
    return true;
  }

  /** Release every lock held by an owner (called when they disconnect). */
  releaseAllByOwner(ownerId: string): string[] {
    const freed: string[] = [];
    for (const [nodeId, entry] of this.locks) {
      if (entry.ownerId === ownerId) {
        clearTimeout(entry.timer);
        this.locks.delete(nodeId);
        freed.push(nodeId);
      }
    }
    return freed;
  }

  clearAll(): void {
    for (const entry of this.locks.values()) clearTimeout(entry.timer);
    this.locks.clear();
  }

  /** Map of nodeId -> owner clientId. */
  getLocks(): LockMap {
    const map: LockMap = {};
    for (const [nodeId, entry] of this.locks) map[nodeId] = entry.ownerId;
    return map;
  }

  private arm(nodeId: string, ownerId: string): void {
    const prev = this.locks.get(nodeId);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      this.locks.delete(nodeId);
      this.onExpire?.(nodeId);
    }, STALE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.locks.set(nodeId, { ownerId, timer });
  }
}
