import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export interface FluxUploadConfig {
  port: number;
  databaseUrl: string;
  authToken: string;
  corsOrigin: string;
  s3Bucket: string;
  s3Region: string;
  s3Endpoint?: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3ForcePathStyle: boolean;
  uploadDefaultChunkSize: number;
  uploadSessionTtlHours: number;
  presignExpiresSeconds: number;
  objectKeyPrefix: string;
}

export const FLUX_UPLOAD_CONFIG = Symbol('FLUX_UPLOAD_CONFIG');

const fluxUploadConfigProvider = {
  provide: FLUX_UPLOAD_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): FluxUploadConfig => createFluxUploadConfig(configService),
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [fluxUploadConfigProvider],
  exports: [fluxUploadConfigProvider],
})
export class FluxUploadConfigModule {}

export function createFluxUploadConfig(configService: ConfigService): FluxUploadConfig {
  const s3Endpoint = getOptionalString(configService, 'S3_ENDPOINT');
  const forcePathStyleFromEnv = getOptionalBoolean(configService, 'S3_FORCE_PATH_STYLE');

  return {
    port: getRequiredNumber(configService, 'PORT'),
    databaseUrl: getRequiredString(configService, 'DATABASE_URL'),
    authToken: getRequiredString(configService, 'AUTH_TOKEN'),
    corsOrigin: getRequiredString(configService, 'CORS_ORIGIN'),
    s3Bucket: getRequiredString(configService, 'S3_BUCKET'),
    s3Region: getRequiredString(configService, 'S3_REGION'),
    s3Endpoint,
    s3AccessKey: getRequiredString(configService, 'S3_ACCESS_KEY'),
    s3SecretKey: getRequiredString(configService, 'S3_SECRET_KEY'),
    s3ForcePathStyle: forcePathStyleFromEnv ?? Boolean(s3Endpoint),
    uploadDefaultChunkSize: getRequiredNumber(configService, 'UPLOAD_DEFAULT_CHUNK_SIZE'),
    uploadSessionTtlHours: getRequiredNumber(configService, 'UPLOAD_SESSION_TTL_HOURS'),
    presignExpiresSeconds: getRequiredNumber(configService, 'PRESIGN_EXPIRES_SECONDS'),
    objectKeyPrefix: getRequiredString(configService, 'OBJECT_KEY_PREFIX'),
  };
}

function getRequiredString(configService: ConfigService, key: string): string {
  const value = configService.get<string>(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required configuration: ${key}`);
  }

  return value;
}

function getOptionalString(configService: ConfigService, key: string): string | undefined {
  const value = configService.get<string>(key);
  if (!value) {
    return undefined;
  }

  return value;
}

function getRequiredNumber(configService: ConfigService, key: string): number {
  const value = configService.get<number>(key);
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing required numeric configuration: ${key}`);
  }

  return value;
}

function getOptionalBoolean(configService: ConfigService, key: string): boolean | undefined {
  const raw = configService.get<string | boolean>(key);

  if (typeof raw === 'boolean') {
    return raw;
  }

  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

export function resolveCorsOrigin(corsOrigin: string): true | string | string[] {
  const trimmed = corsOrigin.trim();
  if (trimmed === '*' || trimmed.length === 0) {
    return true;
  }

  const origins = trimmed
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (origins.length === 0) {
    return true;
  }

  if (origins.length === 1) {
    return origins[0] as string;
  }

  return origins;
}
