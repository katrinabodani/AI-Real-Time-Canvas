import {
  CANVAS,
  LIMITS,
  canvasStateSchema,
  halfExtents,
  type CanvasNode,
  type DraftNode,
} from './canvas';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Clamp a center (x, y) so the node's bounding box stays inside the padded
 *  canvas. Used both when generating and on every server-side `node:move`. */
export function clampCenter(
  hx: number,
  hy: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const minX = CANVAS.padding + hx;
  const maxX = CANVAS.width - CANVAS.padding - hx;
  const minY = CANVAS.padding + hy;
  const maxY = CANVAS.height - CANVAS.padding - hy;
  return {
    // If a shape is somehow wider than the usable area, center it.
    x: minX > maxX ? CANVAS.width / 2 : clamp(x, minX, maxX),
    y: minY > maxY ? CANVAS.height / 2 : clamp(y, minY, maxY),
  };
}

/** Clamp an existing node's position into bounds, returning the new center. */
export function clampNodePosition(
  node: CanvasNode,
  x: number,
  y: number,
): { x: number; y: number } {
  const { hx, hy } = halfExtents(node);
  return clampCenter(hx, hy, x, y);
}

function normalizeLabel(label: string): string {
  return label.slice(0, LIMITS.maxLabel);
}

function normalizeOne(draft: DraftNode): CanvasNode {
  const label = normalizeLabel(draft.label);
  if (draft.type === 'circle') {
    const radius = clamp(draft.radius, LIMITS.minRadius, LIMITS.maxRadius);
    const { x, y } = clampCenter(radius, radius, draft.x, draft.y);
    return { ...draft, id: newId(), label, radius, x, y };
  }
  const width = clamp(draft.width, LIMITS.minSide, LIMITS.maxSide);
  const height = clamp(draft.height, LIMITS.minSide, LIMITS.maxSide);
  const { x, y } = clampCenter(width / 2, height / 2, draft.x, draft.y);
  return { ...draft, id: newId(), label, width, height, x, y };
}

/**
 * The single validate + normalize tail every generated set passes through,
 * regardless of source (rules or LLM):
 *   cap to 12 → clamp sizes → truncate labels → clamp into bounds → assign ids
 *   → Zod-validate the final state.
 */
export function normalizeNodes(drafts: DraftNode[]): CanvasNode[] {
  const capped = drafts.slice(0, LIMITS.maxNodes);
  const nodes = capped.map(normalizeOne);
  // Defense in depth: the result must satisfy the shared schema.
  return canvasStateSchema.parse({ nodes }).nodes;
}
