export {
  FluxUploadModule,
  setupFluxUploadSwagger,
  setupFluxUploadCors,
  setupFluxUploadFromEnv,
  type FluxUploadModuleOptions,
  type FluxUploadModuleAsyncOptions,
  type FluxUploadSwaggerOptions,
} from './flux-upload.module.js';

export {
  FluxUploadService,
  type InitUploadResponse,
  type SignPartsResponse,
  type UploadStatusResponse,
  type CompleteUploadResponse,
} from './flux-upload.service.js';

export { FluxUploadController } from './flux-upload.controller.js';

export { FluxUploadAuthModule } from './auth/auth.module.js';
export { FluxUploadAuthGuard } from './auth/auth.guard.js';
export type { AuthUser, AuthenticatedRequest } from './auth/auth.types.js';

export {
  FluxUploadConfigModule,
  FLUX_UPLOAD_CONFIG,
  createFluxUploadConfig,
  resolveCorsOrigin,
  type FluxUploadConfig,
} from './config/config.module.js';
export { fluxUploadConfigValidationSchema } from './config/config.schema.js';

export { PrismaModule } from './prisma/prisma.module.js';
export { PrismaService } from './prisma/prisma.service.js';

export { S3CompatibleAdapter } from './storage/s3-compatible.adapter.js';
export {
  STORAGE_ADAPTER,
  type StorageAdapter,
  type StorageCompletedPart,
  type StorageListedPart,
} from './storage/storage.adapter.js';

export { InitUploadDto } from './dto/init-upload.dto.js';
export { SignPartsDto } from './dto/sign-parts.dto.js';
export { CommitPartsDto, CommitPartDto } from './dto/commit-parts.dto.js';
export { CompleteUploadDto, CompletePartDto } from './dto/complete-upload.dto.js';

export {
  UploadSessionNotFoundException,
  UploadSessionExpiredException,
  UploadSessionConflictException,
  StorageOperationException,
} from './errors/http-errors.js';

export { buildObjectKey } from './utils/object-key.js';
export { sanitizeFileName, sanitizePrefix, sanitizeEtag } from './utils/sanitize.js';
