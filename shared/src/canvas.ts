import { z } from 'zod';

/** Logical canvas dimensions. All coordinates are in this fixed logical space so
 *  a node at (400, 200) means the same thing on every client (sync correctness).
 *  The client scales the Konva Stage to fit; children stay in logical space. */
export const CANVAS = {
  width: 1000,
  height: 700,
  /** Min distance any shape's bounding box keeps from the canvas edge. */
  padding: 40,
} as const;

export const LIMITS = {
  maxNodes: 12,
  maxLabel: 2,
  minRadius: 12,
  maxRadius: 90,
  minSide: 24,
  maxSide: 180,
} as const;

/** Labels are capped at 2 characters by the spec. */
const labelSchema = z.string().max(LIMITS.maxLabel);

const baseNodeSchema = z.object({
  id: z.string().min(1),
  /** Center x in logical canvas space. */
  x: z.number().finite(),
  /** Center y in logical canvas space. */
  y: z.number().finite(),
  label: labelSchema,
  /** Cosmetic only; not required by the spec JSON. */
  color: z.string().optional(),
});

export const circleNodeSchema = baseNodeSchema.extend({
  type: z.literal('circle'),
  radius: z.number().positive().max(LIMITS.maxRadius),
});

export const rectangleNodeSchema = baseNodeSchema.extend({
  type: z.literal('rectangle'),
  width: z.number().positive().max(LIMITS.maxSide),
  height: z.number().positive().max(LIMITS.maxSide),
});

export const canvasNodeSchema = z.discriminatedUnion('type', [
  circleNodeSchema,
  rectangleNodeSchema,
]);

export const canvasStateSchema = z.object({
  nodes: z.array(canvasNodeSchema).max(LIMITS.maxNodes),
});

/**
 * Lenient schema for nodes the LLM returns *directly* (with coordinates, per the
 * spec example), before they get an id. Only structure is validated here — sizes,
 * labels, count and bounds are enforced afterwards by `normalizeNodes`.
 */
export const llmNodeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('circle'),
    x: z.number().finite(),
    y: z.number().finite(),
    radius: z.number().positive(),
    label: z.string(),
  }),
  z.object({
    type: z.literal('rectangle'),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
    label: z.string(),
  }),
]);

export const llmNodesSchema = z.object({
  nodes: z.array(llmNodeSchema).min(1),
});

export type CircleNode = z.infer<typeof circleNodeSchema>;
export type RectangleNode = z.infer<typeof rectangleNodeSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type ShapeType = CanvasNode['type'];
export type CanvasState = z.infer<typeof canvasStateSchema>;

/** A node before an id is assigned (ids are added in the normalize step).
 *  The LLM returns these (coordinates + size); `normalizeNodes` finalizes them. */
export type DraftNode = Omit<CircleNode, 'id'> | Omit<RectangleNode, 'id'>;

/** Half-extents of a node's axis-aligned bounding box, from its center. */
export function halfExtents(node: CanvasNode): { hx: number; hy: number } {
  if (node.type === 'circle') {
    return { hx: node.radius, hy: node.radius };
  }
  return { hx: node.width / 2, hy: node.height / 2 };
}
