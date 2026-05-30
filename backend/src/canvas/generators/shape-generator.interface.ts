import type { DraftNode } from '@canvas/shared';

/** A successful generation: the draft nodes plus the raw structured output the
 *  engine returned (an Intent for rules, the LLM's node JSON for the LLM), kept
 *  so it can be surfaced in the inspector. */
export interface GenerationResult {
  drafts: DraftNode[];
  raw: unknown;
}

/** One generation strategy. Returns a result, or null if it can't handle the
 *  prompt (so the composite can fall through to the next strategy). */
export interface ShapeGenerator {
  readonly name: string;
  generate(prompt: string): Promise<GenerationResult | null>;
}
