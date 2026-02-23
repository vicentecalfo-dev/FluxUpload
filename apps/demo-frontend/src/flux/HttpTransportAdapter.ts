import type {
  FileMeta,
  PartData,
  TransportAdapter,
  UploadedPart,
} from '@flux-upload/core';

interface BackendInitResponse {
  uploadId: string;
  chunkSize: number;
  expiresAt: string;
  bucket: string;
  objectKey: string;
}

interface BackendSignResponse {
  urls: Array<{
    partNumber: number;
    url: string;
    expiresAt: string;
  }>;
}

interface BackendStatusResponse {
  uploadId: string;
  status: string;
  expiresAt: string;
  uploadedParts: number[];
}

interface HttpTransportAdapterOptions {
  apiBaseUrl: string;
  authToken: string;
}

export class HttpTransportAdapter implements TransportAdapter {
  public constructor(private readonly options: HttpTransportAdapterOptions) {}

  public initUpload = async (input: {
    localId: string;
    fileMeta: FileMeta;
    chunkSize: number;
  }): Promise<{ uploadId: string }> => {
    const payload = {
      fileName: input.fileMeta.name,
      fileSize: input.fileMeta.size,
      contentType: input.fileMeta.type ?? 'application/octet-stream',
      lastModified: input.fileMeta.lastModified ?? Date.now(),
      chunkSize: input.chunkSize,
    };

    const response = await this.backendFetch<BackendInitResponse>('/uploads/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      uploadId: response.uploadId,
    };
  };

  public getUploadedParts = async (input: { uploadId: string }): Promise<number[]> => {
    const response = await this.backendFetch<BackendStatusResponse>(
      `/uploads/${encodeURIComponent(input.uploadId)}/status`,
      {
        method: 'GET',
      },
    );

    return response.uploadedParts ?? [];
  };

  public signPart = async (input: {
    uploadId: string;
    partNumber: number;
  }): Promise<{ url: string; expiresAt?: string }> => {
    const response = await this.backendFetch<BackendSignResponse>(
      `/uploads/${encodeURIComponent(input.uploadId)}/parts/sign`,
      {
        method: 'POST',
        body: JSON.stringify({
          partNumber: input.partNumber,
        }),
      },
    );

    const signed = response.urls.find((item) => item.partNumber === input.partNumber);
    if (!signed) {
      throw new Error(`No signed URL returned for part ${input.partNumber}.`);
    }

    return {
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  };

  public uploadPart = async (input: {
    url: string;
    partNumber: number;
    getPartData: () => Promise<Blob | Uint8Array>;
  }): Promise<{ etag?: string }> => {
    const partData = await input.getPartData();
    const body = toFetchBody(partData);

    const response = await fetch(input.url, {
      method: 'PUT',
      body,
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(
        `Presigned PUT failed for part ${input.partNumber}: ${response.status} ${response.statusText} ${bodyText}`,
      );
    }

    const etag = normalizeEtag(response.headers.get('etag'));
    if (!etag) {
      throw new Error(`Presigned PUT succeeded but ETag header is missing for part ${input.partNumber}.`);
    }

    return { etag };
  };

  public commitParts = async (input: {
    uploadId: string;
    parts: UploadedPart[];
  }): Promise<void> => {
    const normalizedParts = requireEtags(input.parts);

    await this.backendFetch<void>(`/uploads/${encodeURIComponent(input.uploadId)}/parts/commit`, {
      method: 'POST',
      body: JSON.stringify({
        parts: normalizedParts.map((part) => ({
          partNumber: part.partNumber,
          etag: part.etag,
        })),
      }),
      expectNoContent: true,
    });
  };

  public completeUpload = async (input: {
    uploadId: string;
    parts?: UploadedPart[];
  }): Promise<void> => {
    const hasParts = Array.isArray(input.parts) && input.parts.length > 0;
    const normalizedParts = hasParts ? requireEtags(input.parts ?? []) : undefined;

    await this.backendFetch<void>(`/uploads/${encodeURIComponent(input.uploadId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(
        hasParts
          ? {
              parts: normalizedParts?.map((part) => ({
                partNumber: part.partNumber,
                etag: part.etag,
              })),
            }
          : {
              useCommittedParts: true,
            },
      ),
      expectNoContent: false,
    });
  };

  public abortUpload = async (input: { uploadId: string }): Promise<void> => {
    await this.backendFetch<void>(`/uploads/${encodeURIComponent(input.uploadId)}/abort`, {
      method: 'POST',
      expectNoContent: true,
    });
  };

  private readonly backendFetch = async <T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      expectNoContent?: boolean;
    },
  ): Promise<T> => {
    const baseUrl = this.options.apiBaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.options.authToken}`,
        ...(options.body
          ? {
              'Content-Type': 'application/json',
            }
          : {}),
      },
      body: options.body,
    });

    const acceptedStatus = [200, 201, 204];
    if (!acceptedStatus.includes(response.status)) {
      const text = await response.text();
      throw new Error(
        `Backend request failed (${options.method} ${path}): ${response.status} ${response.statusText} ${text}`,
      );
    }

    if (response.status === 204 || options.expectNoContent) {
      return undefined as T;
    }

    const json = (await response.json()) as T;
    return json;
  };
}

function toFetchBody(data: PartData): BodyInit {
  if (data instanceof Uint8Array) {
    const start = data.byteOffset;
    const end = start + data.byteLength;
    return data.buffer.slice(start, end) as ArrayBuffer;
  }

  return data;
}

function normalizeEtag(rawEtag: string | null): string | undefined {
  if (!rawEtag) {
    return undefined;
  }

  return rawEtag.replace(/^"|"$/g, '').trim();
}

function requireEtags(parts: UploadedPart[]): Array<{ partNumber: number; etag: string }> {
  return parts.map((part) => {
    if (!part.etag) {
      throw new Error(`Missing ETag for part ${part.partNumber}.`);
    }

    return {
      partNumber: part.partNumber,
      etag: part.etag,
    };
  });
}
