# @flux-upload/react

Bindings React headless para o motor `@flux-upload/core`.

Este pacote conecta o `UploadManager` ao React com:
- `FluxUploadProvider` (contexto + sincronizacao de estado);
- hooks (`useFluxUpload`, `useUploadList`, `useUpload`);
- componentes headless (`UploadList`, `UploadItem`).

Nao inclui UI pronta. Ele fornece estado e acoes para voce montar sua interface.

## 1. O que o pacote resolve

O `@flux-upload/core` faz a orquestracao do upload.  
O `@flux-upload/react` adiciona a camada React para:
- consumir uploads por contexto;
- refletir progresso/status em tempo real;
- criar, iniciar, pausar, retomar e cancelar uploads via actions;
- restaurar uploads persistidos ao carregar a pagina;
- lidar com reconexao de arquivo quando necessario.

## 2. Quando usar

Use `@flux-upload/react` quando voce quer:
- controle total de UI (headless);
- integrar upload multipart/resumable em app React/Next;
- usar hooks em vez de assinar eventos manualmente.

Se voce quer UI pronta, use `@flux-upload/ui-shadcn` por cima deste pacote.

## 3. Requisitos

- `react >= 18`
- `react-dom >= 18`
- `@flux-upload/core`

## 4. Instalacao

```bash
pnpm add @flux-upload/react @flux-upload/core
```

## 5. Conceitos principais

- `UploadManager`: motor do upload (vem do `core`).
- `FluxUploadProvider`: conecta manager + store ao React.
- `UploadState` (react): estado do core + `runtime`:
  - `runtime.isBound`: se o arquivo/fonte de bytes esta vinculado.
  - `runtime.needsReconnect`: se precisa rebind de arquivo para continuar.

## 6. Quick start

### 6.1 Crie um `UploadManager`

Voce precisa de um `transportAdapter` do `@flux-upload/core`.

```ts
import { UploadManager } from '@flux-upload/core';

const manager = new UploadManager({
  transportAdapter: myTransportAdapter,
  defaultChunkSize: 5 * 1024 * 1024,
  defaultConcurrency: 3,
});
```

### 6.2 Envolva a aplicacao com `FluxUploadProvider`

```tsx
'use client';

import { FluxUploadProvider } from '@flux-upload/react';

export function AppUploadProvider({ children }: { children: React.ReactNode }) {
  return <FluxUploadProvider manager={manager}>{children}</FluxUploadProvider>;
}
```

### 6.3 Use o hook `useFluxUpload`

```tsx
'use client';

import { useFluxUpload } from '@flux-upload/react';

export function UploadPage() {
  const { uploads, actions } = useFluxUpload();

  async function onSelectFile(file: File) {
    const { localId } = await actions.createUploadFromFile(file);
    await actions.start(localId);
  }

  return (
    <div>
      <p>Total: {uploads.length}</p>
      <ul>
        {uploads.map((upload) => (
          <li key={upload.localId}>
            {upload.fileMeta.name} - {upload.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 7. API de alto nivel

### 7.1 `FluxUploadProvider`

Props:
- `manager: UploadManager`  
ou
- `managerOptions: UploadManagerOptions` (o provider instancia internamente)
- `store?:` store custom (ex.: criado com `createFluxUploadStore()`)
- `autoPauseOnOffline?: boolean` (default `true`)
- `autoResumeOnReconnect?: boolean` (default `false`)

Comportamento automatico do provider:
- no boot, chama `rehydratePersistedUploads({ pauseRunningOnBoot: true })`;
- sincroniza store quando o manager emite eventos;
- pausa uploads em `offline` (se habilitado);
- pausa uploads em `beforeunload`/`pagehide`.

### 7.2 `useFluxUpload()`

Retorna:
- `uploads: UploadState[]`
- `uploadsById: Record<string, UploadState>`
- `actions: FluxUploadActions`
- `manager: UploadManager`

`actions` disponiveis:
- `createUploadFromFile(file, options?)`
- `bindFile(localId, file)`
- `start(localId)`
- `pause(localId)`
- `resume(localId)`
- `cancel(localId)`
- `list()`
- `refreshFromPersistence()`

### 7.3 `useUploadList()`

Retorna a lista de uploads ja ordenada pela store.

### 7.4 `useUpload(localId)`

Retorna:
- `upload?: UploadState`
- `actions` vinculadas ao `localId`:
  - `start`, `pause`, `resume`, `cancel`, `bindFile`

## 8. Criacao de upload e opcoes

`createUploadFromFile(file, options?)` aceita:
- `autoStart?: boolean`
- `chunkSize?: number`
- `concurrency?: number`
- `retry?: RetryOptions` (tipo do `@flux-upload/core`)
- `localId?: string`

Exemplo:

```ts
const { localId } = await actions.createUploadFromFile(file, {
  autoStart: true,
  chunkSize: 5 * 1024 * 1024,
  concurrency: 3,
});
```

## 9. Reconexao de arquivo (resume apos refresh)

Quando o upload e restaurado da persistencia, o arquivo original pode nao estar mais em memoria do browser.

Nesse caso:
- `runtime.isBound` tende a `false`;
- `runtime.needsReconnect` fica `true` para estados `idle`, `paused` ou `error`.

Fluxo recomendado:
1. mostre botao "Reconectar arquivo" quando `needsReconnect === true`;
2. chame `actions.bindFile(localId, fileEscolhido)`;
3. chame `actions.resume(localId)` (ou `start`).

Validacoes de `bindFile`:
- nome, tamanho e `lastModified` devem bater com o upload original;
- se nao bater, lanca `FileMismatchError` com `code = FILE_MISMATCH`.

## 10. Componentes headless

### 10.1 `UploadList`

```tsx
import { UploadList } from '@flux-upload/react';

<UploadList>
  {({ uploads, actions }) => (
    <div>
      {uploads.map((u) => (
        <button key={u.localId} onClick={() => actions.pause(u.localId)}>
          {u.fileMeta.name}
        </button>
      ))}
    </div>
  )}
</UploadList>;
```

### 10.2 `UploadItem`

```tsx
import { UploadItem } from '@flux-upload/react';

<UploadItem localId={localId}>
  {({ upload, actions }) =>
    upload ? (
      <div>
        <strong>{upload.fileMeta.name}</strong>
        <button onClick={() => actions.pause()}>Pausar</button>
      </div>
    ) : null
  }
</UploadItem>;
```

## 11. Store custom

Por padrao, o provider usa `createFluxUploadStore()`.  
Se quiser compartilhar/inspecionar snapshots externamente, injete seu store:

```tsx
import { createFluxUploadStore, FluxUploadProvider } from '@flux-upload/react';

const store = createFluxUploadStore();

<FluxUploadProvider manager={manager} store={store}>
  <App />
</FluxUploadProvider>;
```

## 12. SSR / Next.js

- hooks e provider sao `use client`;
- operacoes com `File`, eventos `offline/online` e `beforeunload` exigem browser;
- em Next.js, use esses componentes apenas em client components.

## 13. Integracao com o ecossistema Flux Upload

- `@flux-upload/core`: motor e adapters de transporte/persistencia.
- `@flux-upload/react`: bindings React (este pacote).
- `@flux-upload/ui-shadcn`: UI pronta sobre os hooks do React.
- `@flux-upload/nest`: backend/control plane para multipart com S3-compatible.

## 14. Erros e troubleshooting rapido

- `useFluxUploadContext must be used within FluxUploadProvider`
  - use os hooks somente dentro do provider.
- `FILE_MISMATCH` ao reconectar
  - garanta mesmo arquivo (nome/tamanho/lastModified).
- upload fica pausado apos refresh
  - esperado: rebind do arquivo pode ser necessario.
- upload pausa quando fica offline
  - esperado com `autoPauseOnOffline=true`.

## 15. Exemplo de uso recomendado (componente completo)

```tsx
'use client';

import { useRef, type ChangeEvent } from 'react';
import { useFluxUpload } from '@flux-upload/react';

export function UploadWidget() {
  const { uploads, actions } = useFluxUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of files) {
      const { localId } = await actions.createUploadFromFile(file);
      await actions.start(localId);
    }
  };

  return (
    <section>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(event) => {
          void onFiles(event);
        }}
      />
      <ul>
        {uploads.map((u) => (
          <li key={u.localId}>
            {u.fileMeta.name} - {u.status} - {u.bytesConfirmed}/{u.fileMeta.size}
            {u.runtime.needsReconnect ? (
              <span> (precisa reconectar arquivo)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

## 16. Desenvolvimento no monorepo

```bash
pnpm -C packages/react typecheck
pnpm -C packages/react test
pnpm -C packages/react build
```
