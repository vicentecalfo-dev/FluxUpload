import type { UploadState } from '@flux-upload/react';

export type UploadUiStatus =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'error'
  | 'completed'
  | 'canceled'
  | 'expired'
  | 'needs-reconnect';

export function getUploadUiStatus(upload: UploadState): UploadUiStatus {
  if (upload.runtime?.needsReconnect) {
    return 'needs-reconnect';
  }

  switch (upload.status) {
    case 'idle':
      return 'queued';
    case 'running':
      return 'uploading';
    case 'paused':
      return 'paused';
    case 'error':
      return 'error';
    case 'completed':
      return 'completed';
    case 'canceled':
      return 'canceled';
    case 'expired':
      return 'expired';
    default:
      return 'queued';
  }
}

export function getUploadProgressPct(upload: UploadState): number {
  const total = upload.fileMeta.size;
  if (total <= 0) {
    return 100;
  }

  const pct = (upload.bytesConfirmed / total) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0 B';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = units[0] as string;

  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index] as string;
  }

  return `${size.toFixed(1)} ${unit}`;
}

export function canPause(upload: UploadState): boolean {
  return upload.status === 'running';
}

export function canCancel(upload: UploadState): boolean {
  return upload.status !== 'completed' && upload.status !== 'canceled' && upload.status !== 'expired';
}

export function canResume(upload: UploadState): boolean {
  const status = getUploadUiStatus(upload);
  return status === 'queued' || status === 'paused' || status === 'error' || status === 'needs-reconnect';
}

export function getBadgeVariant(status: UploadUiStatus):
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'paused':
    case 'queued':
      return 'secondary';
    case 'error':
    case 'canceled':
      return 'danger';
    case 'expired':
      return 'outline';
    case 'needs-reconnect':
      return 'warning';
    case 'uploading':
      return 'default';
    default:
      return 'outline';
  }
}
