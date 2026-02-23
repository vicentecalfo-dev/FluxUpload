import type { FluxUploadActions, UploadState } from '@flux-upload/react';

export interface FluxUploadPanelLabels {
  emptyMessage: string;
  queued: string;
  uploading: string;
  paused: string;
  error: string;
  completed: string;
  canceled: string;
  needsReconnect: string;
  resume: string;
  pause: string;
  cancel: string;
  reconnect: string;
  resumeAll: string;
  pauseAll: string;
  refresh: string;
  progressLabel: string;
  reconnectTitle: string;
  reconnectDescription: string;
  chooseFile: string;
  bindAndResume: string;
  mismatchPrefix: string;
}

export interface FileMismatchInfo {
  localId: string;
  error: unknown;
  file: File;
}

export interface FluxUploadPanelProps {
  title?: string;
  emptyMessage?: string;
  onFileMismatch?: (info: FileMismatchInfo) => void;
  showGlobalActions?: boolean;
  className?: string;
  labels?: Partial<FluxUploadPanelLabels>;
}

export interface UploadListViewProps {
  uploads: UploadState[];
  actions: FluxUploadActions;
  emptyMessage: string;
  labels: FluxUploadPanelLabels;
  onFileMismatch?: (info: FileMismatchInfo) => void;
}

export interface UploadRowProps {
  upload: UploadState;
  actions: FluxUploadActions;
  labels: FluxUploadPanelLabels;
  onFileMismatch?: (info: FileMismatchInfo) => void;
}

export interface ReconnectFileDialogProps {
  localId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconnect: (file: File) => Promise<void>;
  labels: FluxUploadPanelLabels;
  onFileMismatch?: (info: FileMismatchInfo) => void;
}
