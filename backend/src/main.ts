import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Load env from the backend dir and, as a fallback, the repo root (so a single
// root .env works whether you run from root or from backend/).
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Canvas server listening on http://localhost:${port}`);
}

void bootstrap();
