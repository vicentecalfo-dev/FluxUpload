import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { UploadStatus } from '@prisma/client';
import type { UploadPart, UploadSession } from '@prisma/client';

import type { CommitPartsDto } from './dto/commit-parts.dto.js';
import type { CompleteUploadDto, CompletePartDto } from './dto/complete-upload.dto.js';
import type { InitUploadDto } from './dto/init-upload.dto.js';
import type { SignPartsDto } from './dto/sign-parts.dto.js';
import { FLUX_UPLOAD_CONFIG, type FluxUploadConfig } from './config/config.module.js';
import {
  StorageOperationException,
  UploadSessionConflictException,
  UploadSessionExpiredException,
  UploadSessionNotFoundException,
} from './errors/http-errors.js';
import { PrismaService } from './prisma/prisma.service.js';
import { STORAGE_ADAPTER, type StorageAdapter, type StorageCompletedPart } from './storage/storage.adapter.js';
import { buildObjectKey } from './utils/object-key.js';
import { sanitizeEtag } from './utils/sanitize.js';

type SessionWithParts = UploadSession & { parts: UploadPart[] };

export interface InitUploadResponse {
  uploadId: string;
  chunkSize: number;
  expiresAt: string;
  bucket: string;
  objectKey: string;
}

export interface SignedPartUrl {
  partNumber: number;
  url: string;
  expiresAt: string;
}

export interface SignPartsResponse {
  urls: SignedPartUrl[];
}

export interface UploadStatusResponse {
  uploadId: string;
  status: UploadStatus;
  expiresAt: string;
  uploadedParts: number[];
}

export interface CompleteUploadResponse {
  fileId: string;
  bucket: string;
  objectKey: string;
}

@Injectable()
export class FluxUploadService {
  private readonly logger = new Logger(FluxUploadService.name);

  public constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER)
    private readonly storageAdapter: StorageAdapter,
    @Inject(FLUX_UPLOAD_CONFIG)
    private readonly config: FluxUploadConfig,
  ) {}

  public async initUpload(ownerId: string, dto: InitUploadDto): Promise<InitUploadResponse> {
    const uploadId = randomUUID();
    const chunkSize = dto.chunkSize ?? this.config.uploadDefaultChunkSize;
    const expiresAt = new Date(Date.now() + this.config.uploadSessionTtlHours * 60 * 60 * 1000);

    if (chunkSize <= 0) {
      throw new BadRequestException('chunkSize must be a positive integer.');
    }

    const objectKey = buildObjectKey({
      defaultPrefix: this.config.objectKeyPrefix,
      requestPrefix: dto.prefix,
      uploadId,
      fileName: dto.fileName,
    });

    let multipartUploadId: string;
    try {
      multipartUploadId = await this.storageAdapter.createMultipartUpload(
        this.config.s3Bucket,
        objectKey,
        dto.contentType,
        {
          ownerId,
          uploadId,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to initialize multipart upload for session ${uploadId}.`, error);
      throw new StorageOperationException('Failed to initialize multipart upload.');
    }

    await this.prisma.uploadSession.create({
      data: {
        id: uploadId,
        ownerId,
        bucket: this.config.s3Bucket,
        objectKey,
        fileName: dto.fileName,
        fileSize: BigInt(dto.fileSize),
        contentType: dto.contentType,
        lastModified: BigInt(dto.lastModified),
        chunkSize,
        status: UploadStatus.uploading,
        multipartUploadId,
        expiresAt,
      },
    });

    return {
      uploadId,
      chunkSize,
      expiresAt: expiresAt.toISOString(),
      bucket: this.config.s3Bucket,
      objectKey,
    };
  }

  public async signParts(
    ownerId: string,
    uploadId: string,
    dto: SignPartsDto,
  ): Promise<SignPartsResponse> {
    const session = await this.getSessionForOperation(ownerId, uploadId, 'sign parts');
    const partNumbers = parsePartNumbers(dto);
    const expiresAt = new Date(Date.now() + this.config.presignExpiresSeconds * 1000).toISOString();

    try {
      const urls = await Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await this.storageAdapter.signUploadPart(
            session.bucket,
            session.objectKey,
            session.multipartUploadId,
            partNumber,
            this.config.presignExpiresSeconds,
          ),
          expiresAt,
        })),
      );

      return { urls };
    } catch (error) {
      this.logger.error(`Failed to sign parts for session ${uploadId}.`, error);
      throw new StorageOperationException('Failed to sign upload URL(s).');
    }
  }

  public async commitParts(ownerId: string, uploadId: string, dto: CommitPartsDto): Promise<void> {
    const session = await this.getSessionForOperation(ownerId, uploadId, 'commit parts');

    if (dto.parts.length === 0) {
      throw new BadRequestException('parts cannot be empty.');
    }

    await this.prisma.$transaction([
      ...dto.parts.map((part) =>
        this.prisma.uploadPart.upsert({
          where: {
            sessionId_partNumber: {
              sessionId: session.id,
              partNumber: part.partNumber,
            },
          },
          create: {
            sessionId: session.id,
            partNumber: part.partNumber,
            etag: sanitizeEtag(part.etag),
            size: part.size,
          },
          update: {
            etag: sanitizeEtag(part.etag),
            size: part.size,
          },
        }),
      ),
      this.prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: UploadStatus.uploading },
      }),
    ]);
  }

  public async getStatus(ownerId: string, uploadId: string): Promise<UploadStatusResponse> {
    let session = await this.getOwnedSessionOrThrow(ownerId, uploadId);
    session = await this.refreshExpiredStatus(session);

    let uploadedParts: number[];

    if (session.status === UploadStatus.aborted || session.status === UploadStatus.expired) {
      uploadedParts = session.parts.map((part) => part.partNumber).sort((a, b) => a - b);
    } else {
      try {
        const listedParts = await this.storageAdapter.listParts(
          session.bucket,
          session.objectKey,
          session.multipartUploadId,
        );
        uploadedParts = listedParts.map((part) => part.partNumber);
      } catch (error) {
        this.logger.warn(
          `Falling back to DB committed parts for session ${uploadId} after listParts failure.`,
        );
        this.logger.debug(String(error));
        uploadedParts = session.parts.map((part) => part.partNumber).sort((a, b) => a - b);
      }
    }

    return {
      uploadId: session.id,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      uploadedParts,
    };
  }

  public async completeUpload(
    ownerId: string,
    uploadId: string,
    dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponse> {
    const session = await this.getSessionForOperation(ownerId, uploadId, 'complete upload');

    const completionParts = await this.resolveCompletionParts(session, dto);
    if (completionParts.length === 0) {
      throw new UploadSessionConflictException('No parts available to complete upload.');
    }

    try {
      await this.storageAdapter.completeMultipartUpload(
        session.bucket,
        session.objectKey,
        session.multipartUploadId,
        completionParts,
      );
    } catch (error) {
      this.logger.error(`Failed to complete multipart upload for session ${uploadId}.`, error);
      throw new StorageOperationException('Failed to complete multipart upload.');
    }

    await this.prisma.$transaction([
      ...completionParts.map((part) =>
        this.prisma.uploadPart.upsert({
          where: {
            sessionId_partNumber: {
              sessionId: session.id,
              partNumber: part.partNumber,
            },
          },
          create: {
            sessionId: session.id,
            partNumber: part.partNumber,
            etag: sanitizeEtag(part.etag),
          },
          update: {
            etag: sanitizeEtag(part.etag),
          },
        }),
      ),
      this.prisma.uploadSession.update({
        where: { id: session.id },
        data: {
          status: UploadStatus.completed,
          completedAt: new Date(),
        },
      }),
    ]);

    return {
      fileId: session.id,
      bucket: session.bucket,
      objectKey: session.objectKey,
    };
  }

  public async abortUpload(ownerId: string, uploadId: string): Promise<void> {
    const session = await this.getOwnedSessionOrThrow(ownerId, uploadId);

    if (session.status === UploadStatus.completed) {
      throw new UploadSessionConflictException('Cannot abort an upload that is already completed.');
    }

    if (session.status !== UploadStatus.aborted) {
      try {
        await this.storageAdapter.abortMultipartUpload(
          session.bucket,
          session.objectKey,
          session.multipartUploadId,
        );
      } catch (error) {
        this.logger.error(`Failed to abort multipart upload for session ${uploadId}.`, error);
        throw new StorageOperationException('Failed to abort multipart upload.');
      }
    }

    await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        status: UploadStatus.aborted,
      },
    });
  }

  private async resolveCompletionParts(
    session: SessionWithParts,
    dto: CompleteUploadDto,
  ): Promise<StorageCompletedPart[]> {
    const hasInlineParts = Array.isArray(dto.parts) && dto.parts.length > 0;

    if (dto.useCommittedParts && hasInlineParts) {
      throw new BadRequestException(
        'Provide either useCommittedParts=true or parts[], but not both.',
      );
    }

    if (dto.useCommittedParts) {
      const committedParts = await this.prisma.uploadPart.findMany({
        where: { sessionId: session.id },
        orderBy: { partNumber: 'asc' },
      });

      return committedParts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag,
      }));
    }

    if (!hasInlineParts) {
      throw new BadRequestException('parts[] is required when useCommittedParts is not true.');
    }

    return normalizeCompletionParts(dto.parts ?? []);
  }

  private async getSessionForOperation(
    ownerId: string,
    uploadId: string,
    operation: string,
  ): Promise<SessionWithParts> {
    let session = await this.getOwnedSessionOrThrow(ownerId, uploadId);
    session = await this.refreshExpiredStatus(session);

    if (session.status === UploadStatus.expired) {
      throw new UploadSessionExpiredException(uploadId);
    }

    if (session.status === UploadStatus.aborted) {
      throw new UploadSessionConflictException(`Cannot ${operation} on an aborted upload session.`);
    }

    if (session.status === UploadStatus.completed) {
      throw new UploadSessionConflictException(`Cannot ${operation} on a completed upload session.`);
    }

    return session;
  }

  private async getOwnedSessionOrThrow(ownerId: string, uploadId: string): Promise<SessionWithParts> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
      include: {
        parts: true,
      },
    });

    if (!session || session.ownerId !== ownerId) {
      throw new UploadSessionNotFoundException(uploadId);
    }

    return session;
  }

  private async refreshExpiredStatus(session: SessionWithParts): Promise<SessionWithParts> {
    const isTerminal =
      session.status === UploadStatus.completed ||
      session.status === UploadStatus.aborted ||
      session.status === UploadStatus.expired;

    if (isTerminal) {
      return session;
    }

    if (session.expiresAt.getTime() > Date.now()) {
      return session;
    }

    return this.prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        status: UploadStatus.expired,
      },
      include: {
        parts: true,
      },
    });
  }
}

function parsePartNumbers(dto: SignPartsDto): number[] {
  const partNumbers = new Set<number>();

  if (typeof dto.partNumber === 'number') {
    partNumbers.add(dto.partNumber);
  }

  for (const partNumber of dto.partNumbers ?? []) {
    partNumbers.add(partNumber);
  }

  if (partNumbers.size === 0) {
    throw new BadRequestException('Provide partNumber or partNumbers.');
  }

  return [...partNumbers].sort((a, b) => a - b);
}

function normalizeCompletionParts(parts: CompletePartDto[]): StorageCompletedPart[] {
  if (parts.length === 0) {
    return [];
  }

  const normalized = parts.map((part) => ({
    partNumber: part.partNumber,
    etag: sanitizeEtag(part.etag),
  }));

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];

    if (!previous || !current) {
      continue;
    }

    if (current.partNumber <= previous.partNumber) {
      throw new BadRequestException('parts[] must be strictly ordered by partNumber.');
    }
  }

  return normalized;
}
