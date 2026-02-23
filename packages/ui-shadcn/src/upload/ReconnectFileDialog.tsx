import { FILE_MISMATCH_CODE } from '@flux-upload/react';
import { AlertTriangle, Link2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '../components/badge.js';
import { Button } from '../components/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog.js';
import { Input } from '../components/input.js';
import type { ReconnectFileDialogProps } from '../types.js';

export function ReconnectFileDialog({
  localId,
  open,
  onOpenChange,
  onReconnect,
  labels,
  onFileMismatch,
}: ReconnectFileDialogProps): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReconnect = async (): Promise<void> => {
    if (!selectedFile || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onReconnect(selectedFile);
      onOpenChange(false);
      setSelectedFile(null);
    } catch (error) {
      if (isFileMismatch(error)) {
        const message = error instanceof Error ? error.message : labels.mismatchPrefix;
        setErrorMessage(message);
        onFileMismatch?.({
          localId,
          error,
          file: selectedFile,
        });
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unknown reconnect error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {labels.reconnectTitle}
          </DialogTitle>
          <DialogDescription>{labels.reconnectDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setErrorMessage(null);
            }}
            aria-label={labels.chooseFile}
          />

          {errorMessage ? (
            <Badge variant="danger" className="inline-flex gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {labels.mismatchPrefix}: {errorMessage}
            </Badge>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleReconnect()} disabled={!selectedFile || isSubmitting}>
            {labels.bindAndResume}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isFileMismatch(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'code' in error && (error as { code?: string }).code === FILE_MISMATCH_CODE;
}
