import { describe, expect, it } from 'vitest';
import {
  CANVAS,
  LIMITS,
  canvasStateSchema,
  halfExtents,
  type DraftNode,
} from '../src/canvas';
import { clampCenter, normalizeNodes } from '../src/normalize';

function draftCircle(x: number, y: number, radius = 20, label = 'A'): DraftNode {
  return { type: 'circle', x, y, radius, label };
}

describe('normalizeNodes', () => {
  it('caps the node count to 12', () => {
    const drafts = Array.from({ length: 20 }, (_, i) => draftCircle(500, 350, 20, 'A'));
    expect(normalizeNodes(drafts)).toHaveLength(LIMITS.maxNodes);
  });

  it('truncates labels to 2 characters', () => {
    const [node] = normalizeNodes([draftCircle(500, 350, 20, 'LONG')]);
    expect(node.label).toBe('LO');
  });

  it('assigns a unique id to every node and passes schema validation', () => {
    const nodes = normalizeNodes([draftCircle(500, 350), draftCircle(400, 300)]);
    expect(nodes[0].id).not.toBe(nodes[1].id);
    expect(() => canvasStateSchema.parse({ nodes })).not.toThrow();
  });

  it('clamps out-of-bounds shapes back inside the padded canvas', () => {
    const nodes = normalizeNodes([
      draftCircle(-100, -100, 30), // off the top-left
      draftCircle(9999, 9999, 30), // off the bottom-right
    ]);
    for (const node of nodes) {
      const { hx, hy } = halfExtents(node);
      expect(node.x - hx).toBeGreaterThanOrEqual(CANVAS.padding - 1e-6);
      expect(node.y - hy).toBeGreaterThanOrEqual(CANVAS.padding - 1e-6);
      expect(node.x + hx).toBeLessThanOrEqual(CANVAS.width - CANVAS.padding + 1e-6);
      expect(node.y + hy).toBeLessThanOrEqual(CANVAS.height - CANVAS.padding + 1e-6);
    }
  });

  it('clamps radius and side lengths into their allowed range', () => {
    const [big] = normalizeNodes([draftCircle(500, 350, 9999)]);
    expect(big.type === 'circle' && big.radius).toBe(LIMITS.maxRadius);
  });
});

describe('clampCenter', () => {
  it('keeps a bounding box inside the padded canvas', () => {
    const r = 40;
    const { x, y } = clampCenter(r, r, -50, -50);
    expect(x).toBe(CANVAS.padding + r);
    expect(y).toBe(CANVAS.padding + r);
  });

  it('passes through a position already in bounds', () => {
    const r = 20;
    expect(clampCenter(r, r, 500, 350)).toEqual({ x: 500, y: 350 });
  });
});
