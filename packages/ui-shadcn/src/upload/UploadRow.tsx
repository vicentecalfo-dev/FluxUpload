import { Play, Pause, XCircle, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '../components/badge.js';
import { Button } from '../components/button.js';
import { Progress } from '../components/progress.js';
import type { UploadRowProps } from '../types.js';
import { ReconnectFileDialog } from './ReconnectFileDialog.js';
import {
  canCancel,
  canPause,
  canResume,
  formatBytes,
  getBadgeVariant,
  getUploadProgressPct,
  getUploadUiStatus,
} from './status.js';

export function UploadRow({ upload, actions, labels, onFileMismatch }: UploadRowProps): JSX.Element {
  const [isReconnectDialogOpen, setIsReconnectDialogOpen] = useState(false);

  const uiStatus = getUploadUiStatus(upload);
  const progressPct = getUploadProgressPct(upload);

  const statusLabel = useMemo(() => {
    switch (uiStatus) {
      case 'queued':
        return labels.queued;
      case 'uploading':
        return labels.uploading;
      case 'paused':
        return labels.paused;
      case 'error':
        return labels.error;
      case 'completed':
        return labels.completed;
      case 'canceled':
        return labels.canceled;
      case 'needs-reconnect':
        return labels.needsReconnect;
      default:
        return labels.queued;
    }
  }, [labels, uiStatus]);

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{upload.fileMeta.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatBytes(upload.bytesConfirmed)} / {formatBytes(upload.fileMeta.size)}
          </p>
        </div>
        <Badge variant={getBadgeVariant(uiStatus)}>{statusLabel}</Badge>
      </div>

      <div className="space-y-1">
        <Progress value={progressPct} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {labels.progressLabel}: {Math.round(progressPct)}%
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canResume(upload) ? (
          <Button size="sm" variant="secondary" onClick={() => void actions.resume(upload.localId)}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {labels.resume}
          </Button>
        ) : null}

        {canPause(upload) ? (
          <Button size="sm" variant="outline" onClick={() => void actions.pause(upload.localId)}>
            <Pause className="mr-1.5 h-3.5 w-3.5" />
            {labels.pause}
          </Button>
        ) : null}

        {canCancel(upload) ? (
          <Button size="sm" variant="destructive" onClick={() => void actions.cancel(upload.localId)}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            {labels.cancel}
          </Button>
        ) : null}

        {uiStatus === 'needs-reconnect' ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setIsReconnectDialogOpen(true)}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {labels.reconnect}
            </Button>
            <ReconnectFileDialog
              localId={upload.localId}
              open={isReconnectDialogOpen}
              onOpenChange={setIsReconnectDialogOpen}
              labels={labels}
              onFileMismatch={onFileMismatch}
              onReconnect={async (file) => {
                actions.bindFile(upload.localId, file);
                await actions.resume(upload.localId);
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
