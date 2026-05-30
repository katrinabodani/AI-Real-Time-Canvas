import type { ShapeType } from './canvas';

/** Vertical band used to place single-row layouts and anchored singles. */
export type Band = 'top' | 'center' | 'bottom';

/** Anchor positions for a single positioned shape. */
export type Anchor = 'center' | 'above-center' | 'below-center' | 'top' | 'bottom';

/**
 * Intent is a structured, geometry-free description of a layout request,
 * produced by the deterministic prompt parser. It's used to validate the hard
 * constraints (e.g. counting how many nodes a prompt asks for) before the LLM
 * is called.
 */
export type Intent =
  | RadialIntent
  | GridIntent
  | RowIntent
  | SingleIntent
  | CompositeIntent;

export interface RadialIntent {
  kind: 'radial';
  shape: ShapeType;
  /** Number of surrounding nodes on the ring. */
  ring: number;
  /** If true, a node is placed at the center of the ring. */
  center: boolean;
  centerLabel?: string;
  /** Explicit labels for the ring nodes (otherwise auto A, B, C...). */
  labels?: string[];
}

export interface GridIntent {
  kind: 'grid';
  shape: ShapeType;
  rows: number;
  cols: number;
  labels?: string[];
}

export interface RowIntent {
  kind: 'row';
  shape: ShapeType;
  count: number;
  band: Band;
  labels?: string[];
}

export interface SingleIntent {
  kind: 'single';
  shape: ShapeType;
  anchor: Anchor;
  label?: string;
}

export interface CompositeIntent {
  kind: 'composite';
  parts: Intent[];
}

/** Total node count an intent will produce, used for cap checks. */
export function intentNodeCount(intent: Intent): number {
  switch (intent.kind) {
    case 'radial':
      return intent.ring + (intent.center ? 1 : 0);
    case 'grid':
      return intent.rows * intent.cols;
    case 'row':
      return intent.count;
    case 'single':
      return 1;
    case 'composite':
      return intent.parts.reduce((sum, p) => sum + intentNodeCount(p), 0);
  }
}