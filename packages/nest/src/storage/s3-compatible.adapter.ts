import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import { FLUX_UPLOAD_CONFIG, type FluxUploadConfig } from '../config/config.module.js';
import type { StorageAdapter, StorageCompletedPart, StorageListedPart } from './storage.adapter.js';

@Injectable()
export class S3CompatibleAdapter implements StorageAdapter {
  private readonly client: S3Client;

  public constructor(
    @Inject(FLUX_UPLOAD_CONFIG)
    private readonly config: FluxUploadConfig,
  ) {
    this.client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
    });
  }

  public async createMultipartUpload(
    bucket: string,
    key: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );

    if (!response.UploadId) {
      throw new Error('S3 did not return a multipart UploadId.');
    }

    return response.UploadId;
  }

  public async signUploadPart(
    bucket: string,
    key: string,
    multipartUploadId: string,
    partNumber: number,
    expiresSeconds: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: multipartUploadId,
      PartNumber: partNumber,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresSeconds,
    });
  }

  public async listParts(bucket: string, key: string, multipartUploadId: string): Promise<StorageListedPart[]> {
    const parts: StorageListedPart[] = [];

    let isTruncated = true;
    let partNumberMarker: string | undefined;

    while (isTruncated) {
      const response = await this.client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: multipartUploadId,
          PartNumberMarker: partNumberMarker,
        }),
      );

      for (const part of response.Parts ?? []) {
        if (!part.PartNumber || !part.ETag) {
          continue;
        }

        parts.push({
          partNumber: part.PartNumber,
          etag: normalizeEtag(part.ETag),
          size: typeof part.Size === 'number' ? part.Size : undefined,
        });
      }

      isTruncated = Boolean(response.IsTruncated);
      partNumberMarker = response.NextPartNumberMarker;
    }

    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  public async completeMultipartUpload(
    bucket: string,
    key: string,
    multipartUploadId: string,
    parts: StorageCompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: multipartUploadId,
        MultipartUpload: {
          Parts: parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              ETag: normalizeEtag(part.etag),
              PartNumber: part.partNumber,
            })),
        },
      }),
    );
  }

  public async abortMultipartUpload(bucket: string, key: string, multipartUploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: multipartUploadId,
      }),
    );
  }
}

function normalizeEtag(etag: string): string {
  return etag.replace(/^"|"$/g, '').trim();
}
