import { Injectable, Logger } from '@nestjs/common';
import {
  LIMITS,
  findUnsupportedShape,
  intentNodeCount,
  normalizeNodes,
  parsePrompt,
  type CanvasNode,
  type GenerationMode,
} from '@canvas/shared';
import { LlmGenerator } from './llm.generator';

export interface Generated {
  nodes: CanvasNode[];
  /** The raw structured output the engine returned (the LLM's node JSON). */
  raw: unknown;
  source: string;
}

/**
 * LLM-only generation. Hard constraints are enforced up front by rejecting
 * (not silently coercing) unsupported shapes and over-limit counts; the prompt
 * is parsed deterministically purely to *count/validate* the request. Every
 * result then passes through the shared validate + normalize tail.
 */
@Injectable()
export class ShapeGeneratorService {
  private readonly logger = new Logger(ShapeGeneratorService.name);

  constructor(private readonly llm: LlmGenerator) {}

  async generate(prompt: string, _mode: GenerationMode = 'llm'): Promise<Generated> {
    const trimmed = prompt?.trim();
    if (!trimmed) throw new Error('Prompt is empty.');

    // --- Hard constraints: reject (don't silently coerce) ---
    // 1. Only circles and rectangles are allowed.
    const unsupported = findUnsupportedShape(trimmed);
    if (unsupported) {
      throw new Error(
        `Only circles and rectangles are supported — "${unsupported}" is not. Try circles or rectangles.`,
      );
    }
    // 2. At most 12 shapes. Reject an explicit over-limit request up front
    //    (the count is read deterministically from the prompt).
    const probe = parsePrompt(trimmed);
    if (probe) {
      const requested = intentNodeCount(probe);
      if (requested > LIMITS.maxNodes) {
        throw new Error(
          `Too many shapes: that asks for ${requested}, but the maximum is ${LIMITS.maxNodes}.`,
        );
      }
    }

    if (!this.llm.enabled) {
      throw new Error('LLM is unavailable: set LLM_API_KEY on the server.');
    }
    const result = await this.llm.generate(trimmed);
    if (!result) {
      throw new Error('The LLM did not return a valid layout. Try rephrasing.');
    }

    // Post-check: the LLM must not exceed the limit either.
    if (result.drafts.length > LIMITS.maxNodes) {
      throw new Error(
        `Too many shapes: ${result.drafts.length} were produced, but the maximum is ${LIMITS.maxNodes}.`,
      );
    }

    const nodes = normalizeNodes(result.drafts);
    this.logger.log(`generated ${nodes.length} node(s) via ${this.llm.name}`);
    return { nodes, raw: result.raw, source: this.llm.name };
  }
}
