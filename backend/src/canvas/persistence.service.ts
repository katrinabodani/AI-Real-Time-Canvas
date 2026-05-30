import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { canvasStateSchema, type CanvasNode } from '@canvas/shared';

/** Server-side persistence (bonus): a debounced JSON file, loaded on boot.
 *  Combined with init-on-connect this restores state across refresh AND keeps
 *  every client consistent. SQLite/Redis would be the scaling path. */
@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly file = path.resolve(process.cwd(), 'data', 'canvas-state.json');
  private timer: NodeJS.Timeout | null = null;
  private pending: CanvasNode[] | null = null;

  async load(): Promise<CanvasNode[]> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      return canvasStateSchema.parse(JSON.parse(raw)).nodes;
    } catch {
      return [];
    }
  }

  save(nodes: CanvasNode[]): void {
    this.pending = nodes;
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), 300);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const nodes = this.pending;
    this.pending = null;
    if (!nodes) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify({ nodes }, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(`persist failed: ${(err as Error).message}`);
    }
  }
}
