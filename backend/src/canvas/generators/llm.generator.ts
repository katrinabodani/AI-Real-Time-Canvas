import { Injectable, Logger } from '@nestjs/common';
import { CANVAS, LIMITS, llmNodesSchema, type DraftNode } from '@canvas/shared';
import type { GenerationResult, ShapeGenerator } from './shape-generator.interface';

const { width: W, height: H, padding: PAD } = CANVAS;

const SYSTEM_PROMPT = `You convert a natural-language layout request into JSON describing shapes with absolute positions. Respond with JSON ONLY in the form { "nodes": [ ... ] }.

The canvas is ${W}x${H} pixels, origin at the top-left, x increases to the right, y downward.

Each node:
- "type": "circle" or "rectangle" (only these two).
- "x","y": the CENTER of the shape, in pixels.
- circle: also "radius". rectangle: also "width" and "height".
- "label": at most ${LIMITS.maxLabel} characters.

Rules:
- At most ${LIMITS.maxNodes} nodes.
- Keep every shape fully inside the canvas, ~${PAD}px from the edges.
- Avoid overlaps. Use radius ${LIMITS.minRadius}-${LIMITS.maxRadius}px, rectangle sides ${LIMITS.minSide}-${LIMITS.maxSide}px.
- For a star/radial layout: an optional center node plus evenly spaced nodes on a ring, the first at the top and going clockwise.
- For polygons (pentagon/hexagon/etc.): place the nodes on the polygon's vertices. For an N-pointed star, alternate outer and inner radius around the center.`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Few-shot: a worked example with real coordinates teaches the geometry +
// "first node at top, clockwise" convention.
const FEW_SHOTS: ChatMessage[] = [
  {
    role: 'user',
    content: 'Create a star layout with 1 center node and 6 surrounding nodes',
  },
  {
    role: 'assistant',
    content:
      '{"nodes":[{"type":"circle","x":500,"y":350,"radius":55,"label":"S"},{"type":"circle","x":500,"y":150,"radius":45,"label":"A"},{"type":"circle","x":673,"y":250,"radius":45,"label":"B"},{"type":"circle","x":673,"y":450,"radius":45,"label":"C"},{"type":"circle","x":500,"y":550,"radius":45,"label":"D"},{"type":"circle","x":327,"y":450,"radius":45,"label":"E"},{"type":"circle","x":327,"y":250,"radius":45,"label":"F"}]}',
  },
  {
    role: 'user',
    content: 'Create 3 rectangles in a row',
  },
  {
    role: 'assistant',
    content:
      '{"nodes":[{"type":"rectangle","x":250,"y":350,"width":140,"height":90,"label":"A"},{"type":"rectangle","x":500,"y":350,"width":140,"height":90,"label":"B"},{"type":"rectangle","x":750,"y":350,"width":140,"height":90,"label":"C"}]}',
  },
];

// Strict JSON schema for OpenAI structured outputs: the model can ONLY return
// this exact { nodes: [...] } shape with x/y coordinates.
const NUM = { type: 'number' } as const;
const NODES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodes: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['circle'] },
              x: NUM,
              y: NUM,
              radius: NUM,
              label: { type: 'string' },
            },
            required: ['type', 'x', 'y', 'radius', 'label'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['rectangle'] },
              x: NUM,
              y: NUM,
              width: NUM,
              height: NUM,
              label: { type: 'string' },
            },
            required: ['type', 'x', 'y', 'width', 'height', 'label'],
          },
        ],
      },
    },
  },
  required: ['nodes'],
} as const;

interface ChatResponse {
  choices?: { message?: { content?: string; refusal?: string | null } }[];
}

/**
 * LLM generator. The model returns the canvas JSON *with coordinates* directly
 * (matching the spec's example), constrained by a strict JSON schema and guided
 * by few-shot examples. The result still passes through `normalizeNodes` (in the
 * service) as a safety net: clamp in-bounds, cap at 12, truncate labels, assign
 * ids — so a bad coordinate can never break the canvas.
 */
@Injectable()
export class LlmGenerator implements ShapeGenerator {
  readonly name = 'llm';
  private readonly logger = new Logger(LlmGenerator.name);
  private readonly apiKey = process.env.LLM_API_KEY;
  private readonly baseUrl = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = process.env.LLM_MODEL ?? 'gpt-4o';

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(prompt: string): Promise<GenerationResult | null> {
    if (!this.enabled) return null;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...FEW_SHOTS,
      { role: 'user', content: prompt },
    ];

    let raw = await this.call(messages);
    if (!raw) return null;

    let result = this.toDrafts(raw);
    if (!result.drafts) {
      // One repair attempt with the validation error fed back.
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `That was invalid: ${result.error}. Reply with corrected JSON only — { "nodes": [...] }, circle/rectangle only, <=${LIMITS.maxNodes} nodes, labels <=${LIMITS.maxLabel} chars, inside the ${W}x${H} canvas.`,
      });
      raw = await this.call(messages);
      if (!raw) return null;
      result = this.toDrafts(raw);
      if (!result.drafts) {
        this.logger.warn(`LLM nodes invalid after retry: ${result.error}`);
        return null;
      }
    }

    return { drafts: result.drafts, raw: result.parsed };
  }

  private async call(messages: ChatMessage[]): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'canvas_nodes', strict: true, schema: NODES_JSON_SCHEMA },
          },
        }),
      });
      if (!res.ok) {
        this.logger.warn(`LLM HTTP ${res.status}: ${await res.text()}`);
        return null;
      }
      const data = (await res.json()) as ChatResponse;
      const message = data.choices?.[0]?.message;
      if (message?.refusal) {
        this.logger.warn(`LLM refused: ${message.refusal}`);
        return null;
      }
      return typeof message?.content === 'string' ? message.content : null;
    } catch (err) {
      this.logger.warn(`LLM request failed: ${(err as Error).message}`);
      return null;
    }
  }

  private toDrafts(
    raw: string,
  ): { drafts: DraftNode[] | null; parsed?: unknown; error?: string } {
    try {
      const parsed = llmNodesSchema.parse(JSON.parse(raw));
      return { drafts: parsed.nodes as DraftNode[], parsed };
    } catch (err) {
      return { drafts: null, error: (err as Error).message };
    }
  }
}
