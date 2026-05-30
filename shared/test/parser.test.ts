import { describe, expect, it } from 'vitest';
import { findUnsupportedShape, parsePrompt } from '../src/parser';
import { intentNodeCount } from '../src/intent';

describe('parsePrompt — sample prompts from the spec', () => {
  it('parses the star/radial prompt', () => {
    const intent = parsePrompt(
      'Create a star layout with 1 center node and 6 surrounding nodes',
    );
    expect(intent).toEqual({
      kind: 'radial',
      shape: 'circle',
      ring: 6,
      center: true,
      centerLabel: 'S',
    });
    expect(intentNodeCount(intent!)).toBe(7);
  });

  it('parses the grid prompt with a label range', () => {
    const intent = parsePrompt('Create a 3x4 grid of circles labeled A–L');
    expect(intent).toMatchObject({
      kind: 'grid',
      shape: 'circle',
      rows: 3,
      cols: 4,
    });
    expect(intent && 'labels' in intent && intent.labels).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    ]);
    expect(intentNodeCount(intent!)).toBe(12);
  });

  it('parses the composite "row + extra" prompt', () => {
    const intent = parsePrompt(
      'Create 4 rectangles in a row and 1 circle above center',
    );
    expect(intent?.kind).toBe('composite');
    if (intent?.kind !== 'composite') throw new Error('expected composite');
    expect(intent.parts).toHaveLength(2);
    expect(intent.parts[0]).toMatchObject({
      kind: 'row',
      shape: 'rectangle',
      count: 4,
    });
    expect(intent.parts[1]).toMatchObject({
      kind: 'single',
      shape: 'circle',
      anchor: 'above-center',
    });
    expect(intentNodeCount(intent)).toBe(5);
  });

  it('treats "N circles in a star layout" as a ring with no center', () => {
    const intent = parsePrompt('Create 5 circles in a star layout');
    expect(intent).toMatchObject({ kind: 'radial', ring: 5, center: false });
  });

  it('returns undefined for an empty prompt', () => {
    expect(parsePrompt('   ')).toBeUndefined();
  });
});

describe('constraint detection', () => {
  it('flags unsupported shape nouns (incl. square and box)', () => {
    expect(findUnsupportedShape('draw a triangle')).toBe('triangle');
    expect(findUnsupportedShape('3 diamonds')).toBe('diamond');
    expect(findUnsupportedShape('draw a square')).toBe('square');
    expect(findUnsupportedShape('5 boxes')).toBe('box');
  });

  it('does not flag supported shapes or arrangement words', () => {
    expect(findUnsupportedShape('5 circles in a triangle')).toBeNull();
    expect(findUnsupportedShape('make a 5-pointed star')).toBeNull();
    expect(findUnsupportedShape('a 3x4 grid of circles')).toBeNull();
    expect(findUnsupportedShape('4 rectangles in a row')).toBeNull();
  });

  it('over-limit requests parse to a count above the max (so they can be rejected)', () => {
    expect(intentNodeCount(parsePrompt('create a 4x4 grid of circles')!)).toBe(16);
    expect(intentNodeCount(parsePrompt('create 15 circles')!)).toBe(15);
  });
});
