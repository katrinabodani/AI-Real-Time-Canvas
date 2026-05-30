import { useState } from 'react';
import { useCanvasStore } from '../state/store';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="json-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Collapsible inspector: shows the structured intent the engine returned and
 *  the resulting { nodes } JSON for the current canvas. */
export function JsonInspector() {
  const nodes = useCanvasStore((s) => s.nodes);
  const last = useCanvasStore((s) => s.lastGeneration);

  const rawJson = last ? JSON.stringify(last.raw, null, 2) : null;
  const nodesJson = JSON.stringify({ nodes }, null, 2);
  // The LLM returns the canvas JSON (with x/y coordinates) directly.
  const rawTitle = 'LLM output (JSON with x/y)';

  return (
    <details className="json-inspector">
      <summary>
        <span className="json-caret" aria-hidden>
          ▸
        </span>
        View output JSON
        {last && <span className={`json-source json-source-${last.source}`}>{last.source}</span>}
      </summary>

      <div className="json-body">
        <div className="json-block">
          <div className="json-block-head">
            <span>{rawTitle} {last ? '' : '(generate to populate)'}</span>
            {rawJson && <CopyButton text={rawJson} />}
          </div>
          <pre className="json-pre">
            {rawJson ?? '// Generate a layout to see what the engine returned.'}
          </pre>
        </div>

        <div className="json-block">
          <div className="json-block-head">
            <span>Result · {nodes.length} node(s)</span>
            <CopyButton text={nodesJson} />
          </div>
          <pre className="json-pre">{nodesJson}</pre>
        </div>
      </div>
    </details>
  );
}
