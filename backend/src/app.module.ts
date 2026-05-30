import { Module } from '@nestjs/common';
import { CanvasGateway } from './canvas/canvas.gateway';
import { CanvasStateService } from './canvas/canvas-state.service';
import { LockService } from './canvas/lock.service';
import { PresenceService } from './canvas/presence.service';
import { PersistenceService } from './canvas/persistence.service';
import { LlmGenerator } from './canvas/generators/llm.generator';
import { ShapeGeneratorService } from './canvas/generators/shape-generator.service';

@Module({
  providers: [
    CanvasGateway,
    CanvasStateService,
    LockService,
    PresenceService,
    PersistenceService,
    LlmGenerator,
    ShapeGeneratorService,
  ],
})
export class AppModule {}
