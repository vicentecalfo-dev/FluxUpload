'use client';

import type { ReactElement, ReactNode } from 'react';

import { useUpload } from '../hooks/useUpload.js';
import type { UploadBoundActions, UploadState } from '../types.js';

export interface UploadItemProps {
  localId: string;
  children: (input: { upload: UploadState | undefined; actions: UploadBoundActions }) => ReactNode;
}

export function UploadItem({ localId, children }: UploadItemProps): ReactElement {
  const { upload, actions } = useUpload(localId);
  return <>{children({ upload, actions })}</>;
}
