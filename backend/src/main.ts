import './load-env';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // In production the API also serves the built React app, so everything lives on one URL.
  if (existsSync(config.staticDir)) app.useStaticAssets(config.staticDir);
  app.enableCors({ origin: config.corsOrigin });
  // Validate every request body against its DTO and reject unknown fields.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(config.port);
  console.log(`LiftHours API ready on http://localhost:${config.port}/api`);
}

bootstrap();
