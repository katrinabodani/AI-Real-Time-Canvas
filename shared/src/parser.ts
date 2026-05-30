import type {
  Anchor,
  Band,
  CompositeIntent,
  GridIntent,
  Intent,
  RadialIntent,
  RowIntent,
  SingleIntent,
} from './intent';

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function firstNumberAfter(text: string, keyword: RegExp): number | undefined {
  const m = text.match(
    new RegExp(`(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s*\\w*\\s*${keyword.source}`),
  );
  if (m) return toNumber(m[1]);
  return undefined;
}

function toNumber(token: string): number | undefined {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token];
}

function anyNumber(text: string): number | undefined {
  const m = text.match(new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\b`));
  return m ? toNumber(m[1]) : undefined;
}

function detectShape(text: string): 'circle' | 'rectangle' {
  // Only "rectangle"/"rect" map to a rectangle. "square"/"box" are NOT treated
  // as rectangles — they're rejected upstream by findUnsupportedShape.
  if (/\b(rectangles?|rects?)\b/.test(text)) return 'rectangle';
  return 'circle';
}

/** Expand a "A-L" / "A–L" style range into an array of single-char labels. */
function parseLabelRange(text: string): string[] | undefined {
  const m = text.match(/\b([a-z])\s*(?:-|–|—|to|through)\s*([a-z])\b/i);
  if (!m) return undefined;
  const start = m[1].toUpperCase().charCodeAt(0);
  const end = m[2].toUpperCase().charCodeAt(0);
  if (end < start) return undefined;
  const labels: string[] = [];
  for (let c = start; c <= end; c++) labels.push(String.fromCharCode(c));
  return labels;
}

function parseGrid(text: string): GridIntent | undefined {
  const m = text.match(/(\d+)\s*(?:x|×|\*|by)\s*(\d+)/);
  if (!m) return undefined;
  const rows = parseInt(m[1], 10);
  const cols = parseInt(m[2], 10);
  return {
    kind: 'grid',
    shape: detectShape(text),
    rows,
    cols,
    labels: parseLabelRange(text),
  };
}

function parseRadial(text: string): RadialIntent | undefined {
  if (!/\b(star|radial|surround|around|ring|orbit|spoke)\w*\b/.test(text)) return undefined;
  const hasCenter = /\bcenter\b|\bcentre\b|\bmiddle\b/.test(text);
  const surrounding =
    firstNumberAfter(text, /(?:surrounding|around|outer|ring|satellite|spoke)/) ??
    undefined;
  const total = anyNumber(text);
  let ring: number;
  if (surrounding !== undefined) ring = surrounding;
  else if (total !== undefined) ring = hasCenter ? Math.max(1, total - 1) : total;
  else ring = 6;
  return {
    kind: 'radial',
    shape: detectShape(text),
    ring,
    center: hasCenter,
    centerLabel: 'S',
  };
}

function detectBand(text: string): Band {
  if (/\b(top|above|upper)\b/.test(text)) return 'top';
  if (/\b(bottom|below|lower)\b/.test(text)) return 'bottom';
  return 'center';
}

function detectAnchor(text: string): Anchor {
  if (/above\s+(?:the\s+)?cent(?:er|re)/.test(text)) return 'above-center';
  if (/below\s+(?:the\s+)?cent(?:er|re)/.test(text)) return 'below-center';
  if (/\btop\b|\babove\b|\bupper\b/.test(text)) return 'top';
  if (/\bbottom\b|\bbelow\b|\blower\b/.test(text)) return 'bottom';
  return 'center';
}

/** Parse a single clause (already split on "and") into one intent part. */
function parseClause(text: string): Intent {
  const count = anyNumber(text) ?? 1;
  const shape = detectShape(text);

  // A single positioned shape, e.g. "1 circle above center".
  if (count === 1 && /\b(above|below|center|centre|top|bottom)\b/.test(text)) {
    const single: SingleIntent = { kind: 'single', shape, anchor: detectAnchor(text) };
    return single;
  }

  // Otherwise a row (default layout for "N shapes [in a row]").
  const row: RowIntent = { kind: 'row', shape, count, band: detectBand(text) };
  return row;
}

/** Shape nouns that are NOT circle/rectangle. A square is geometrically a
 *  rectangle but the spec allows only "circle"/"rectangle", so it's rejected too.
 *  (star/pentagon/hexagon are arrangement words, not node shapes — not listed.) */
const UNSUPPORTED_SHAPES = [
  'square', 'box', 'triangle', 'ellipse', 'oval', 'diamond', 'rhombus',
  'trapezoid', 'arrow', 'heart', 'crescent', 'octagon',
];

/**
 * Detect a request for a shape we can't draw — only circles and rectangles are
 * allowed. Returns the offending word, or null. If the prompt also mentions
 * circles or rectangles, the other word is treated as an arrangement
 * (e.g. "5 circles in a triangle") and allowed.
 */
export function findUnsupportedShape(prompt: string): string | null {
  const text = prompt.toLowerCase();
  if (/\b(circles?|rectangles?|rects?)\b/.test(text)) return null;
  for (const shape of UNSUPPORTED_SHAPES) {
    if (new RegExp(`\\b${shape}(?:es|s)?\\b`).test(text)) return shape;
  }
  return null;
}

/**
 * Deterministic prompt → Intent. Used to validate hard constraints (count the
 * nodes a prompt asks for, detect the requested shape) before the LLM call.
 * Returns undefined only if it can't extract anything meaningful.
 */
export function parsePrompt(prompt: string): Intent | undefined {
  const text = prompt.toLowerCase().trim();
  if (!text) return undefined;

  const grid = parseGrid(text);
  if (grid) return grid;

  const radial = parseRadial(text);
  if (radial) return radial;

  // Composite: split on "and" / "+" and parse each clause, if more than one
  // clause actually describes shapes.
  const clauses = text
    .split(/\s+and\s+|\s*\+\s*/)
    .map((c) => c.trim())
    .filter((c) => /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|circle|rect|square|box|shape|node)\w*/.test(c));

  if (clauses.length > 1) {
    const composite: CompositeIntent = {
      kind: 'composite',
      parts: clauses.map(parseClause),
    };
    return composite;
  }

  if (anyNumber(text) !== undefined || /\b(circle|rect|square|box|shape|node)\w*/.test(text)) {
    return parseClause(text);
  }

  return undefined;
}
