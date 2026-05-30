import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Line, Path, Rect, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { CANVAS } from '@canvas/shared';
import { useCanvasStore } from '../state/store';
import { emitCursor, emitSelection } from '../state/socket';
import { ShapeNode } from './ShapeNode';

const FALLBACK_COLOR = '#4f46e5';

const CURSOR_PATH = 'M0,0 L0,18 L5,13 L8,20 L11,19 L8,12 L14,12 Z';
export const GRID_SIZE = 40;
const GRID_COLOR = '#e8edf3';

/**
 * Fixed logical canvas (CANVAS.width x CANVAS.height) scaled to fit its
 * container. The scale lives on the Stage, so child node coordinates stay in
 * logical space — a node at (400, 200) is identical on every client.
 */
export function CanvasStage() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const nodes = useCanvasStore((s) => s.nodes);
  const locks = useCanvasStore((s) => s.locks);
  const myId = useCanvasStore((s) => s.myId);
  const me = useCanvasStore((s) => s.me);
  const peers = useCanvasStore((s) => s.peers);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const peerCursors = Object.values(peers).filter((p) => p.cursor);
  const myColor = me?.color ?? FALLBACK_COLOR;

  const resolveColor = (id: string) =>
    id === myId ? myColor : peers[id]?.color ?? '#f59e0b';

  const selectShape = (id: string) => {
    setSelected(id);
    emitSelection(id);
  };

  // Grid lines are static for the fixed logical canvas — compute once.
  const gridLines = useMemo(() => {
    const lines: number[][] = [];
    for (let x = GRID_SIZE; x < CANVAS.width; x += GRID_SIZE) {
      lines.push([x, 0, x, CANVAS.height]);
    }
    for (let y = GRID_SIZE; y < CANVAS.height; y += GRID_SIZE) {
      lines.push([0, y, CANVAS.width, y]);
    }
    return lines;
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const update = () => {
      const available = wrapper.clientWidth;
      const maxByHeight = (window.innerHeight * 0.78) / CANVAS.height;
      const maxByWidth = available / CANVAS.width;
      setScale(Math.max(0.2, Math.min(maxByWidth, maxByHeight)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const point = e.target.getStage()?.getPointerPosition();
    if (!point) return;
    emitCursor(point.x / scale, point.y / scale);
  };

  // Clicking empty canvas clears the selection.
  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      setSelected(null);
      emitSelection(null);
    }
  };

  return (
    <div className="canvas-wrapper" ref={wrapperRef}>
      <Stage
        width={CANVAS.width * scale}
        height={CANVAS.height * scale}
        scaleX={scale}
        scaleY={scale}
        className="canvas-stage"
        onMouseMove={handleMouseMove}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer listening={false}>
          <Rect
            x={0}
            y={0}
            width={CANVAS.width}
            height={CANVAS.height}
            fill="#ffffff"
            cornerRadius={12}
          />
          {gridLines.map((points, i) => (
            <Line key={i} points={points} stroke={GRID_COLOR} strokeWidth={1} />
          ))}
          <Rect
            x={0.5}
            y={0.5}
            width={CANVAS.width - 1}
            height={CANVAS.height - 1}
            stroke="#dbe2ea"
            strokeWidth={1}
            cornerRadius={12}
          />
        </Layer>
        <Layer>
          {nodes.map((node) => {
            const lockedBy = locks[node.id];
            const lockedByOther = Boolean(lockedBy && lockedBy !== myId);
            // Highlights: my own selection (my color, no name) + every other
            // player who selected this node (their color + their name).
            const highlights: { color: string; name?: string }[] = [];
            if (selectedId === node.id) highlights.push({ color: myColor });
            for (const peer of Object.values(peers)) {
              if (peer.selection === node.id) {
                highlights.push({ color: peer.color, name: peer.name });
              }
            }
            return (
              <ShapeNode
                key={node.id}
                node={node}
                lockedByOther={lockedByOther}
                lockColor={lockedBy ? resolveColor(lockedBy) : undefined}
                highlights={highlights}
                snap={snapToGrid}
                gridSize={GRID_SIZE}
                onSelect={selectShape}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          {peerCursors.map((peer) => (
            <Group key={peer.id} x={peer.cursor!.x} y={peer.cursor!.y}>
              <Path
                data={CURSOR_PATH}
                fill={peer.color}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1}
                shadowColor="rgba(15,23,42,0.3)"
                shadowBlur={4}
                shadowOffsetY={1}
              />
              <Rect
                x={14}
                y={10}
                width={peer.name.length * 7.5 + 12}
                height={18}
                cornerRadius={5}
                fill={peer.color}
              />
              <Text
                text={peer.name}
                x={20}
                y={13}
                fontSize={12}
                fontStyle="bold"
                fill="#ffffff"
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
