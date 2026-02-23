import type { UploadListViewProps } from '../types.js';
import { UploadRow } from './UploadRow.js';

export function UploadListView({
  uploads,
  actions,
  emptyMessage,
  labels,
  onFileMismatch,
}: UploadListViewProps): JSX.Element {
  if (uploads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-3 overflow-auto pr-1">
      {uploads.map((upload) => (
        <UploadRow
          key={upload.localId}
          upload={upload}
          actions={actions}
          labels={labels}
          onFileMismatch={onFileMismatch}
        />
      ))}
    </div>
  );
}
