import { Injectable, OnModuleInit } from '@nestjs/common';
import { clampNodePosition, type CanvasNode } from '@canvas/shared';
import { PersistenceService } from './persistence.service';

/** The single source of truth for canvas state. Nothing else mutates nodes. */
@Injectable()
export class CanvasStateService implements OnModuleInit {
  private nodes: CanvasNode[] = [];

  constructor(private readonly persistence: PersistenceService) {}

  async onModuleInit(): Promise<void> {
    this.nodes = await this.persistence.load();
  }

  getNodes(): CanvasNode[] {
    return this.nodes;
  }

  setNodes(nodes: CanvasNode[]): void {
    this.nodes = nodes;
    this.persistence.save(this.nodes);
  }

  /** Move a node, clamping it inside the canvas (defense in depth). Returns the
   authoritative position, or null if the node no longer exists. */
  moveNode(id: string, x: number, y: number): { id: string; x: number; y: number } | null {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return null;
    const pos = clampNodePosition(node, x, y);
    node.x = pos.x;
    node.y = pos.y;
    this.persistence.save(this.nodes);
    return { id, x: pos.x, y: pos.y };
  }
}
