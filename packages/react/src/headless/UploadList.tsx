'use client';

import type { ReactElement, ReactNode } from 'react';

import { useFluxUpload } from '../hooks/useFluxUpload.js';
import type { FluxUploadActions, UploadState } from '../types.js';

export interface UploadListProps {
  children: (input: { uploads: UploadState[]; actions: FluxUploadActions }) => ReactNode;
}

export function UploadList({ children }: UploadListProps): ReactElement {
  const { uploads, actions } = useFluxUpload();
  return <>{children({ uploads, actions })}</>;
}
