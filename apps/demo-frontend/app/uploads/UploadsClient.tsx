'use client';

import { FluxUploadProvider, useFluxUpload } from '@flux-upload/react';
import { Button, FluxUploadPanel } from '@flux-upload/ui-shadcn';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { getDemoUploadManager } from '../../src/flux/manager';

export default function UploadsClient(): JSX.Element {
  const manager = useMemo(() => getDemoUploadManager(), []);

  return (
    <FluxUploadProvider manager={manager}>
      <UploadsView />
    </FluxUploadProvider>
  );
}

function UploadsView(): JSX.Element {
  const { actions, manager } = useFluxUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isClearingLocalState, setIsClearingLocalState] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void actions.refreshFromPersistence();
  }, [actions]);

  const handlePickFiles = (): void => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      for (const file of files) {
        const { localId } = await actions.createUploadFromFile(file);
        await actions.start(localId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao iniciar upload.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClearLocalState = async (): Promise<void> => {
    setIsClearingLocalState(true);
    setErrorMessage(null);

    try {
      const persistedStates = await manager.persistenceAdapter.list();
      const runningLocalIds = persistedStates
        .filter((state) => state.status === 'running')
        .map((state) => state.localId);

      if (runningLocalIds.length > 0) {
        await Promise.allSettled(runningLocalIds.map((localId) => manager.pause(localId)));
      }

      const removeResults = await Promise.allSettled(
        persistedStates.map((state) => manager.persistenceAdapter.remove(state.localId)),
      );
      const removeFailures = removeResults.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      if (removeFailures.length > 0) {
        throw new Error(
          `Falha ao limpar estado local de ${removeFailures.length} upload(s).`,
        );
      }

      await actions.refreshFromPersistence();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao limpar estado local.');
    } finally {
      setIsClearingLocalState(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Flux Upload Demo</h1>
          <p className="text-sm text-slate-600">
            Upload multipart ponta-a-ponta (Frontend - Presigned URL - MinIO)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleFilesSelected(event);
            }}
          />
          <Button onClick={handlePickFiles} disabled={isCreating || isClearingLocalState}>
            {isCreating ? 'Adicionando...' : 'Adicionar arquivos'}
          </Button>
          <Button
            onClick={() => {
              void handleClearLocalState();
            }}
            variant="outline"
            disabled={isCreating || isClearingLocalState}
          >
            {isClearingLocalState ? 'Limpando...' : 'Limpar estado local'}
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <FluxUploadPanel
        title="Uploads"
        labels={{
          emptyMessage: 'Nenhum upload criado ainda.',
          queued: 'Na fila',
          uploading: 'Enviando',
          paused: 'Pausado',
          error: 'Erro',
          completed: 'Concluido',
          canceled: 'Cancelado',
          expired: 'Expirado',
          expiredHint: 'Sessao expirada. Inicie um novo upload para continuar.',
          needsReconnect: 'Precisa reconectar',
          resume: 'Retomar',
          pause: 'Pausar',
          cancel: 'Cancelar',
          reconnect: 'Reconectar',
          resumeAll: 'Retomar todos',
          pauseAll: 'Pausar ativos',
          refresh: 'Atualizar',
          progressLabel: 'Progresso',
          reconnectTitle: 'Reconectar arquivo',
          reconnectDescription: 'Selecione o mesmo arquivo original para continuar.',
          chooseFile: 'Escolher arquivo',
          bindAndResume: 'Reconectar e retomar',
          mismatchPrefix: 'Arquivo nao corresponde',
        }}
        onFileMismatch={(info) => {
          setErrorMessage(
            info.error instanceof Error
              ? info.error.message
              : 'Arquivo selecionado nao corresponde ao upload salvo.',
          );
        }}
      />
    </main>
  );
}
