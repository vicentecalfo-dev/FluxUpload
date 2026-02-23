import { Module } from '@nestjs/common';
import type { DynamicModule, INestApplication, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { ConfigModule, type ConfigModuleOptions, ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { FluxUploadAuthModule } from './auth/auth.module.js';
import { FluxUploadConfigModule, createFluxUploadConfig, resolveCorsOrigin } from './config/config.module.js';
import { fluxUploadConfigValidationSchema } from './config/config.schema.js';
import { FluxUploadController } from './flux-upload.controller.js';
import { FluxUploadService } from './flux-upload.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { S3CompatibleAdapter } from './storage/s3-compatible.adapter.js';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage/storage.adapter.js';

export interface FluxUploadModuleOptions {
  configModuleOptions?: ConfigModuleOptions;
  storageAdapter?: Type<StorageAdapter>;
}

export interface FluxUploadModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  storageAdapter?: Type<StorageAdapter>;
}

const defaultStorageProvider: Provider = {
  provide: STORAGE_ADAPTER,
  useClass: S3CompatibleAdapter,
};

@Module({
  imports: [ConfigModule, FluxUploadConfigModule, PrismaModule, FluxUploadAuthModule],
  controllers: [FluxUploadController],
  providers: [FluxUploadService, defaultStorageProvider],
  exports: [FluxUploadService, STORAGE_ADAPTER, FluxUploadConfigModule, PrismaModule],
})
export class FluxUploadModule {
  public static forRoot(options: FluxUploadModuleOptions = {}): DynamicModule {
    const storageOverride = buildStorageOverride(options.storageAdapter);

    return {
      module: FluxUploadModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: fluxUploadConfigValidationSchema,
          ...options.configModuleOptions,
        }),
      ],
      providers: storageOverride ? [storageOverride] : [],
      exports: storageOverride ? [storageOverride] : [],
    };
  }

  public static forRootAsync(options: FluxUploadModuleAsyncOptions = {}): DynamicModule {
    const storageOverride = buildStorageOverride(options.storageAdapter);

    return {
      module: FluxUploadModule,
      imports: options.imports ?? [],
      providers: storageOverride ? [storageOverride] : [],
      exports: storageOverride ? [storageOverride] : [],
    };
  }
}

export interface FluxUploadSwaggerOptions {
  path?: string;
  title?: string;
  description?: string;
  version?: string;
}

export function setupFluxUploadSwagger(
  app: INestApplication,
  options: FluxUploadSwaggerOptions = {},
): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(options.title ?? 'Flux Upload API')
    .setDescription(options.description ?? 'Control plane endpoints for multipart uploads.')
    .setVersion(options.version ?? '1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(options.path ?? 'api', app, document);
}

export function setupFluxUploadCors(app: INestApplication, corsOrigin: string): void {
  app.enableCors({
    origin: resolveCorsOrigin(corsOrigin),
  });
}

export function setupFluxUploadFromEnv(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const config = createFluxUploadConfig(configService);

  setupFluxUploadCors(app, config.corsOrigin);
  setupFluxUploadSwagger(app);
}

function buildStorageOverride(storageAdapter?: Type<StorageAdapter>): Provider | null {
  if (!storageAdapter) {
    return null;
  }

  return {
    provide: STORAGE_ADAPTER,
    useClass: storageAdapter,
  };
}
