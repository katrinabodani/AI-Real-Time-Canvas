import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockService } from '../src/canvas/lock.service';

describe('LockService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('grants a lock on a free node and lets the owner move it', () => {
    const locks = new LockService();
    expect(locks.tryLock('n1', 'alice')).toBe(true);
    expect(locks.canMove('n1', 'alice')).toBe(true);
    expect(locks.getLocks()).toEqual({ n1: 'alice' });
  });

  it('blocks a different owner from locking or moving a held node', () => {
    const locks = new LockService();
    locks.tryLock('n1', 'alice');
    expect(locks.tryLock('n1', 'bob')).toBe(false);
    expect(locks.canMove('n1', 'bob')).toBe(false);
    // The original owner can still re-acquire (idempotent).
    expect(locks.tryLock('n1', 'alice')).toBe(true);
  });

  it('allows moving an unlocked node (last-write-wins fallback)', () => {
    const locks = new LockService();
    expect(locks.canMove('free', 'anyone')).toBe(true);
  });

  it('unlock only succeeds for the owner', () => {
    const locks = new LockService();
    locks.tryLock('n1', 'alice');
    expect(locks.unlock('n1', 'bob')).toBe(false);
    expect(locks.unlock('n1', 'alice')).toBe(true);
    expect(locks.getLocks()).toEqual({});
  });

  it('releaseAllByOwner frees every node held by that owner', () => {
    const locks = new LockService();
    locks.tryLock('a', 'alice');
    locks.tryLock('b', 'alice');
    locks.tryLock('c', 'bob');
    const freed = locks.releaseAllByOwner('alice').sort();
    expect(freed).toEqual(['a', 'b']);
    expect(locks.getLocks()).toEqual({ c: 'bob' });
  });

  it('auto-expires a stale lock and fires onExpire', () => {
    vi.useFakeTimers();
    const locks = new LockService();
    const expired: string[] = [];
    locks.onExpire = (id) => expired.push(id);

    locks.tryLock('n1', 'alice');
    vi.advanceTimersByTime(10_000);

    expect(locks.getLocks()).toEqual({});
    expect(expired).toEqual(['n1']);
  });

  it('refresh re-arms the idle timeout so an active drag keeps its lock', () => {
    vi.useFakeTimers();
    const locks = new LockService();
    locks.tryLock('n1', 'alice');

    vi.advanceTimersByTime(8_000);
    locks.refresh('n1', 'alice'); // still dragging — keep it alive
    vi.advanceTimersByTime(8_000); // 16s total, but only 8s since refresh

    expect(locks.canMove('n1', 'alice')).toBe(true);
    expect(locks.getLocks()).toEqual({ n1: 'alice' });
  });
});