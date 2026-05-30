import { useEffect } from 'react';
import { CANVAS } from '@canvas/shared';
import { useCanvasStore } from './state/store';
import { getSocket } from './state/socket';
import { CanvasStage } from './canvas/CanvasStage';
import { PromptBar } from './components/PromptBar';
import { JsonInspector } from './components/JsonInspector';

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  disconnected: 'Disconnected',
};

export function App() {
  const status = useCanvasStore((s) => s.status);
  const error = useCanvasStore((s) => s.error);
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const setError = useCanvasStore((s) => s.setError);
  const toasts = useCanvasStore((s) => s.toasts);
  const dismissToast = useCanvasStore((s) => s.dismissToast);
  const peerCount = useCanvasStore((s) => Object.keys(s.peers).length);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const setSnapToGrid = useCanvasStore((s) => s.setSnapToGrid);

  useEffect(() => {
    getSocket();
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const newest = toasts[toasts.length - 1];
    const timer = setTimeout(() => dismissToast(newest.id), 2800);
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-group">
          <h1>AI Real-Time Canvas</h1>
        </div>
        <div className="header-right">
          <div className="presence-pill" title="People on this canvas">
            <span className="presence-dot" />
            {peerCount + 1} online
          </div>
          <div className={`status status-${status}`}>
            <span className="status-dot" />
            {STATUS_LABEL[status] ?? status}
          </div>
        </div>
      </header>

      <PromptBar />

      <div className="controls">
        <label className="switch">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => setSnapToGrid(e.target.checked)}
          />
          <span className="switch-track" aria-hidden />
          Snap to grid
        </label>
        <span className="controls-hint">Click a shape to select it · drag to move</span>
      </div>

      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            style={{ borderLeftColor: t.color }}
            onClick={() => dismissToast(t.id)}
          >
            <span className="toast-dot" style={{ background: t.color }} />
            {t.text}
          </div>
        ))}
      </div>

      <CanvasStage />

      <JsonInspector />

      <footer className="app-footer">
        <span>
          {nodeCount} / {12} shapes
        </span>
        <span className="hint">
          Open this page in a second tab and drag a shape to see live sync. Logical
          canvas {CANVAS.width}×{CANVAS.height}.
        </span>
      </footer>
    </div>
  );
}
