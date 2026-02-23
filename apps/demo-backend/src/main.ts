import 'reflect-metadata';
import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  setupFluxUploadCors,
  setupFluxUploadSwagger,
} from '@flux-upload/nest';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupFluxUploadCors(app, process.env.CORS_ORIGIN ?? 'http://localhost:3000');
  setupFluxUploadSwagger(app, {
    path: 'api',
    title: 'Flux Upload Demo Backend',
    description: 'Demo control plane for multipart uploads',
    version: '0.1.0',
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Demo backend running on http://localhost:${port}`);
}

void bootstrap();
