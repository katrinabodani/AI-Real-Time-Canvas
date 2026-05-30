import { useState } from 'react';
import { useCanvasStore } from '../state/store';
import { generate } from '../state/socket';

const SAMPLES = [
  'Create a star layout with 1 center node and 6 surrounding nodes',
  'Create a 3x4 grid of circles labeled A-L',
  'Create 4 rectangles in a row and 1 circle above center',
];

export function PromptBar() {
  const [prompt, setPrompt] = useState(SAMPLES[0]);
  const generating = useCanvasStore((s) => s.generating);

  const submit = (text: string) => {
    if (!generating) void generate(text);
  };

  return (
    <div className="prompt-bar">
      <form
        className="prompt-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(prompt);
        }}
      >
        <input
          className="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a layout, e.g. a 3x4 grid of circles"
          aria-label="Layout prompt"
        />
        <button className="prompt-button" type="submit" disabled={generating}>
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </form>
      <div className="samples">
        {SAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            className="sample-chip"
            onClick={() => {
              setPrompt(s);
              submit(s);
            }}
            disabled={generating}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
