import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  EVENTS,
  type CursorMovePayload,
  type GenerateAck,
  type GeneratePayload,
  type LockAck,
  type LockPayload,
  type MovePayload,
  type SelectionSetPayload,
  type UnlockPayload,
} from '@canvas/shared';
import { CanvasStateService } from './canvas-state.service';
import { LockService } from './lock.service';
import { PresenceService } from './presence.service';
import { ShapeGeneratorService } from './generators/shape-generator.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class CanvasGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly state: CanvasStateService,
    private readonly locks: LockService,
    private readonly presence: PresenceService,
    private readonly generator: ShapeGeneratorService,
  ) {}

  afterInit(): void {
    // A stale lock expiring is broadcast to everyone.
    this.locks.onExpire = (id) => this.server.emit(EVENTS.unlocked, { id });
  }

  /** Resolve the stable per-tab identity sent in the socket handshake. */
  private ownerId(client: Socket): string {
    const fromAuth = client.handshake.auth?.clientId;
    return typeof fromAuth === 'string' && fromAuth ? fromAuth : client.id;
  }

  /** Init-on-connect: hand the joining socket the full authoritative state and
   *  presence roster, then announce the new peer to everyone else. */
  handleConnection(client: Socket): void {
    const clientId = this.ownerId(client);
    client.data.clientId = clientId;
    client.emit(EVENTS.state, {
      nodes: this.state.getNodes(),
      locks: this.locks.getLocks(),
    });
    const { peer, isNew } = this.presence.add(clientId, client.id);
    client.emit(EVENTS.presenceInit, {
      me: peer,
      peers: this.presence.list(clientId),
    });
    // Only announce a genuinely new participant (not a reconnect of one already
    // known to everyone), so identities don't flicker on reconnects.
    if (isNew) client.broadcast.emit(EVENTS.presenceJoin, peer);
  }

  /** Free locks the owner held and remove it from presence (if truly gone). */
  handleDisconnect(client: Socket): void {
    const removed = this.presence.removeBySocket(client.id);
    if (!removed) return; // a reconnect already took over this identity
    for (const id of this.locks.releaseAllByOwner(removed)) {
      this.server.emit(EVENTS.unlocked, { id });
    }
    this.server.emit(EVENTS.presenceLeave, { id: removed });
  }

  @SubscribeMessage(EVENTS.cursorMove)
  onCursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: CursorMovePayload,
  ): void {
    const x = Number(body?.x);
    const y = Number(body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const owner = this.ownerId(client);
    this.presence.setCursor(owner, x, y);
    client.broadcast.emit(EVENTS.cursorMoved, { id: owner, x, y });
  }

  @SubscribeMessage(EVENTS.selectionSet)
  onSelectionSet(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SelectionSetPayload,
  ): void {
    const nodeId =
      body && typeof body.nodeId === 'string' ? body.nodeId : null;
    const owner = this.ownerId(client);
    this.presence.setSelection(owner, nodeId);
    client.broadcast.emit(EVENTS.selectionChanged, { id: owner, nodeId });
  }

  @SubscribeMessage(EVENTS.generate)
  async onGenerate(@MessageBody() body: GeneratePayload): Promise<GenerateAck> {
    try {
      const { nodes, raw, source } = await this.generator.generate(
        body?.prompt ?? '',
        body?.mode,
      );
      this.state.setNodes(nodes);
      this.locks.clearAll(); // fresh canvas -> drop any held locks
      // Everyone (incl. sender) renders the identical authoritative result;
      // raw + source ride along so clients can inspect the engine's output.
      this.server.emit(EVENTS.generated, { nodes, raw, source });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage(EVENTS.move)
  onMove(@ConnectedSocket() client: Socket, @MessageBody() body: MovePayload): void {
    if (!body || typeof body.id !== 'string') return;
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const owner = this.ownerId(client);
    if (!this.locks.canMove(body.id, owner)) return;

    const moved = this.state.moveNode(body.id, x, y);
    if (!moved) return;
    this.locks.refresh(body.id, owner);
    // Everyone EXCEPT the sender (sender already moved it optimistically).
    client.broadcast.emit(EVENTS.moved, moved);
  }

  @SubscribeMessage(EVENTS.lock)
  onLock(@ConnectedSocket() client: Socket, @MessageBody() body: LockPayload): LockAck {
    if (!body || typeof body.id !== 'string') return { granted: false };
    const owner = this.ownerId(client);
    const granted = this.locks.tryLock(body.id, owner);
    if (granted) {
      client.broadcast.emit(EVENTS.locked, { id: body.id, by: owner });
    }
    return { granted };
  }

  @SubscribeMessage(EVENTS.unlock)
  onUnlock(@ConnectedSocket() client: Socket, @MessageBody() body: UnlockPayload): void {
    if (!body || typeof body.id !== 'string') return;
    if (this.locks.unlock(body.id, this.ownerId(client))) {
      client.broadcast.emit(EVENTS.unlocked, { id: body.id });
    }
  }
}
