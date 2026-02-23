import { useFluxUpload } from '@flux-upload/react';
import { Pause, Play, RefreshCcw } from 'lucide-react';

import { cn } from '../cn.js';
import { Button } from '../components/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card.js';
import type { FluxUploadPanelLabels, FluxUploadPanelProps } from '../types.js';
import { canPause, canResume } from './status.js';
import { UploadListView } from './UploadListView.js';

const DEFAULT_LABELS: FluxUploadPanelLabels = {
  emptyMessage: 'Nenhum upload na fila.',
  queued: 'Queued',
  uploading: 'Uploading',
  paused: 'Paused',
  error: 'Error',
  completed: 'Completed',
  canceled: 'Canceled',
  needsReconnect: 'Needs reconnect',
  resume: 'Resume',
  pause: 'Pause',
  cancel: 'Cancel',
  reconnect: 'Reconnect',
  resumeAll: 'Resume all',
  pauseAll: 'Pause active',
  refresh: 'Refresh',
  progressLabel: 'Progress',
  reconnectTitle: 'Reconnect file',
  reconnectDescription: 'Select the same file used when this upload was created.',
  chooseFile: 'Choose file',
  bindAndResume: 'Bind and resume',
  mismatchPrefix: 'File mismatch',
};

export function FluxUploadPanel({
  title = 'Uploads',
  emptyMessage,
  onFileMismatch,
  showGlobalActions = true,
  className,
  labels,
}: FluxUploadPanelProps): JSX.Element {
  const { uploads, actions } = useFluxUpload();

  const mergedLabels = {
    ...DEFAULT_LABELS,
    ...labels,
    emptyMessage: emptyMessage ?? labels?.emptyMessage ?? DEFAULT_LABELS.emptyMessage,
  } satisfies FluxUploadPanelLabels;

  const handleResumeAll = async (): Promise<void> => {
    const resumable = uploads.filter((upload) => canResume(upload) && upload.runtime.isBound);
    await Promise.allSettled(resumable.map((upload) => actions.resume(upload.localId)));
  };

  const handlePauseAll = async (): Promise<void> => {
    const running = uploads.filter((upload) => canPause(upload));
    await Promise.allSettled(running.map((upload) => actions.pause(upload.localId)));
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          {showGlobalActions ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void handleResumeAll()}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {mergedLabels.resumeAll}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handlePauseAll()}>
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                {mergedLabels.pauseAll}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void actions.refreshFromPersistence()}>
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                {mergedLabels.refresh}
              </Button>
            </div>
          ) : null}
        </div>
        <CardDescription>Flux Upload panel (headless + shadcn-style skin)</CardDescription>
      </CardHeader>

      <CardContent>
        <UploadListView
          uploads={uploads}
          actions={actions}
          emptyMessage={mergedLabels.emptyMessage}
          labels={mergedLabels}
          onFileMismatch={onFileMismatch}
        />
      </CardContent>
    </Card>
  );
}
