import { useRef } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { clampCenter, halfExtents, type CanvasNode } from '@canvas/shared';
import { lockNode, moveNode, unlockNode } from '../state/socket';

interface Highlight {
  color: string;
  /** Present for other players' selections; absent for my own. */
  name?: string;
}

interface ShapeNodeProps {
  node: CanvasNode;
  /** True when another user holds the lock on this node. */
  lockedByOther: boolean;
  /** Color identifying the user who holds the lock (when lockedByOther). */
  lockColor?: string;
  /** Selection highlights to draw (mine + other players', each in their color). */
  highlights: Highlight[];
  snap: boolean;
  gridSize: number;
  onSelect: (id: string) => void;
}

const LABEL_COLOR = '#ffffff';

function snapTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function ShapeNode({
  node,
  lockedByOther,
  lockColor,
  highlights,
  snap,
  gridSize,
  onSelect,
}: ShapeNodeProps) {
  const denied = useRef(false);
  const { hx, hy } = halfExtents(node);
  const draggable = !lockedByOther;

  // Snap the center to the grid (when enabled), then clamp inside the canvas.
  const resolvePosition = (rawX: number, rawY: number) => {
    const x = snap ? snapTo(rawX, gridSize) : rawX;
    const y = snap ? snapTo(rawY, gridSize) : rawY;
    return clampCenter(hx, hy, x, y);
  };

  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
    const target = e.target;
    target.moveToTop();
    onSelect(node.id);
    denied.current = false;
    void lockNode(node.id).then((granted) => {
      if (!granted) {
        denied.current = true;
        target.stopDrag();
        target.position({ x: node.x, y: node.y });
        target.getLayer()?.batchDraw();
      }
    });
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (denied.current) return;
    const pos = resolvePosition(e.target.x(), e.target.y());
    e.target.position(pos);
    moveNode(node.id, pos.x, pos.y);
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (!denied.current) {
      const pos = resolvePosition(e.target.x(), e.target.y());
      e.target.position(pos);
      moveNode(node.id, pos.x, pos.y, { final: true });
    }
    unlockNode(node.id);
  };

  const setCursor = (e: KonvaEventObject<MouseEvent>, cursor: string) => {
    const container = e.target.getStage()?.container();
    if (container) container.style.cursor = cursor;
  };

  const fill = node.color ?? (node.type === 'circle' ? '#22c55e' : '#6366f1');
  const primaryHighlight = highlights[0]?.color;
  const stroke = lockedByOther
    ? lockColor ?? '#f59e0b'
    : primaryHighlight ?? 'rgba(15,23,42,0.12)';
  const strokeWidth = lockedByOther || highlights.length > 0 ? 3 : 1.5;

  const fontSize = Math.max(12, Math.min(hx, hy) * 0.95);
  // Other players' names to show on this object (never my own).
  const names = highlights.filter((h) => h.name);

  return (
    <Group
      x={node.x}
      y={node.y}
      draggable={draggable}
      opacity={lockedByOther ? 0.85 : 1}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(node.id)}
      onTap={() => onSelect(node.id)}
      onMouseEnter={(e) => setCursor(e, draggable ? 'grab' : 'not-allowed')}
      onMouseDown={(e) => draggable && setCursor(e, 'grabbing')}
      onMouseUp={(e) => draggable && setCursor(e, 'grab')}
      onMouseLeave={(e) => setCursor(e, 'default')}
    >
      {/* Selection highlight rings (one per selecting player, in their color) */}
      {highlights.map((h, i) =>
        node.type === 'circle' ? (
          <Circle
            key={i}
            radius={node.radius + 6 + i * 5}
            stroke={h.color}
            strokeWidth={3}
            fillEnabled={false}
            shadowColor={h.color}
            shadowBlur={16}
            shadowOpacity={0.5}
            listening={false}
          />
        ) : (
          <Rect
            key={i}
            x={-node.width / 2 - 6 - i * 5}
            y={-node.height / 2 - 6 - i * 5}
            width={node.width + 12 + i * 10}
            height={node.height + 12 + i * 10}
            cornerRadius={12}
            stroke={h.color}
            strokeWidth={3}
            fillEnabled={false}
            shadowColor={h.color}
            shadowBlur={16}
            shadowOpacity={0.5}
            listening={false}
          />
        ),
      )}

      {node.type === 'circle' ? (
        <Circle
          radius={node.radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={lockedByOther ? [8, 6] : undefined}
          shadowColor="rgba(15,23,42,0.25)"
          shadowBlur={8}
          shadowOffsetY={3}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      ) : (
        <Rect
          x={-node.width / 2}
          y={-node.height / 2}
          width={node.width}
          height={node.height}
          cornerRadius={8}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={lockedByOther ? [8, 6] : undefined}
          shadowColor="rgba(15,23,42,0.25)"
          shadowBlur={8}
          shadowOffsetY={3}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      )}
      <Text
        text={node.label}
        x={-hx}
        y={-hy}
        width={hx * 2}
        height={hy * 2}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle="bold"
        fill={LABEL_COLOR}
        listening={false}
      />

      {/* Other players' names, shown on the object they're highlighting */}
      {names.map((h, i) => {
        const label = h.name ?? '';
        const width = label.length * 7.5 + 14;
        return (
          <Group key={`name-${i}`} x={-width / 2} y={-hy - 16 - i * 22} listening={false}>
            <Rect width={width} height={18} cornerRadius={6} fill={h.color} />
            <Text
              text={label}
              x={0}
              y={3}
              width={width}
              align="center"
              fontSize={12}
              fontStyle="bold"
              fill={LABEL_COLOR}
            />
          </Group>
        );
      })}
    </Group>
  );
}
