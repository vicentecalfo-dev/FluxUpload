# @flux-upload/core

Motor de upload multipart/resumable agnostico de framework e agnostico de provider de storage.

Este pacote concentra:
- planejamento de partes (chunks);
- concorrencia de upload;
- pause/resume/cancel;
- retry com backoff + jitter;
- reconciliacao com partes ja enviadas no backend/storage;
- persistencia de estado via adapter;
- eventos para UI/telemetria.

## 1. O que este pacote resolve

O `@flux-upload/core` executa o ciclo completo do upload no cliente sem acoplar em React, Next, Nest ou S3 SDK.

Voce fornece 2 adapters:
1. `TransportAdapter`: como falar com seu backend/storage.
2. `PersistenceAdapter`: como salvar/restaurar estado local.

Com isso, o core gerencia a orquestracao do upload.

## 2. Escopo e limites

Este pacote **faz**:
- quebrar arquivo em partes e subir em paralelo;
- retomar upload interrompido;
- reconciliar com partes ja existentes no remoto;
- emitir eventos de progresso/status/erro;
- persistir estado incremental.

Este pacote **nao faz**:
- UI;
- chamadas HTTP prontas;
- validacoes especificas de provider (ex.: regra minima de 5 MiB do S3 multipart);
- limpeza automatica de registros persistidos ao concluir/cancelar.

## 3. Conceitos principais

- `localId`: id local do upload no cliente.
- `uploadId`: id remoto da sessao retornado pelo backend.
- `chunkSize`: tamanho de cada parte (em bytes).
- `uploadedParts`: lista de partes confirmadas.
- `partEtags`: mapa `partNumber -> etag`.
- `bytesConfirmed`: bytes efetivamente confirmados.

Status possiveis:
- `idle`
- `running`
- `paused`
- `completed`
- `error`
- `canceled`
- `expired`

## 4. Arquitetura resumida

Fluxo interno do `UploadManager`/`UploadTask`:
1. cria estado local (`createUpload`);
2. inicia sessao remota (`transport.initUpload`);
3. consulta partes remotas (`transport.getUploadedParts`);
4. assina URL da parte (`transport.signPart`);
5. envia bytes da parte (`transport.uploadPart`);
6. opcionalmente confirma parte no backend (`transport.commitParts`, se implementado);
7. finaliza multipart (`transport.completeUpload`);
8. persiste e emite eventos a cada transicao relevante.

## 5. API publica

Export principal:
- `UploadManager`

Tipos principais:
- `UploadState`
- `UploadStatus`
- `FileMeta`
- `PartSpec`
- `PartDataProvider`
- `UploadManagerOptions`
- `CreateUploadOverrides`
- `TransportAdapter`
- `PersistenceAdapter`

Erros exportados:
- `FluxUploadError`
- `AbortError`
- `UploadNotFoundError`
- `MissingPartDataProviderError`
- `InvalidUploadStateError`
- `PersistenceError`
- `UploadSessionExpiredError`
- `isAbortError`
- `isUploadSessionExpiredError`

Implementacao de persistencia pronta:
- `MemoryPersistenceAdapter`

### 5.1 `UploadManager`

Construtor:

```ts
new UploadManager({
  transportAdapter,
  persistenceAdapter?,      // default: MemoryPersistenceAdapter
  defaultChunkSize?,        // default: 5 * 1024 * 1024
  defaultConcurrency?,      // default: 3
  defaultRetry?,            // retry policy global
})
```

Metodos principais:
- `createUpload(fileMeta, partDataProvider, overrides?) => localId`
- `start(localId)`
- `pause(localId, options?)`
- `resume(localId)`
- `cancel(localId)`
- `reconcile(localId)`
- `listStates()`
- `restorePersistedUploads()`
- `rehydratePersistedUploads({ pauseRunningOnBoot?, pauseOptions? })`
- `bindPartDataProvider(localId, provider)` (alias: `bindDataProvider`)
- `hasPartDataProvider(localId)`

Eventos:
- `status` -> `{ localId, status, message? }`
- `progress` -> `{ localId, bytesConfirmed, totalBytes, pct }`
- `error` -> `{ localId, error }`
- `completed` -> `{ localId }`

Assinatura:

```ts
const unsubscribe = manager.on("progress", (payload) => {
  console.log(payload.pct);
});
unsubscribe();
```

## 6. Contratos de adapters

### 6.1 `TransportAdapter`

```ts
interface TransportAdapter {
  initUpload(input: { localId: string; fileMeta: FileMeta; chunkSize: number }): Promise<{ uploadId: string }>;
  getUploadedParts(input: { uploadId: string }): Promise<number[]>;
  signPart(input: { uploadId: string; partNumber: number }): Promise<{ url: string; expiresAt?: string }>;
  uploadPart(input: { url: string; partNumber: number; getPartData: () => Promise<Blob | Uint8Array> }): Promise<{ etag?: string }>;
  commitParts?(input: { uploadId: string; parts: { partNumber: number; etag?: string }[] }): Promise<void>;
  completeUpload(input: { uploadId: string; parts?: { partNumber: number; etag?: string }[] }): Promise<void>;
  abortUpload(input: { uploadId: string }): Promise<void>;
}
```

Observacoes:
- `commitParts` e opcional.
- Se `commitParts` nao existir, o core ainda funciona.
- O core envia `parts` no `completeUpload` quando tiver ETags em memoria; caso contrario chama `completeUpload` sem `parts`.

### 6.2 `PersistenceAdapter`

```ts
interface PersistenceAdapter {
  save(state: UploadState): Promise<void>;
  load(localId: string): Promise<UploadState | null>;
  list(): Promise<UploadState[]>;
  remove(localId: string): Promise<void>;
}
```

Use `MemoryPersistenceAdapter` para cenarios simples ou testes.
Para browser, prefira IndexedDB.

## 7. Guia rapido de uso

### Passo 1: instanciar o manager

```ts
import { UploadManager } from "@flux-upload/core";

const manager = new UploadManager({
  transportAdapter: myTransportAdapter,
  defaultChunkSize: 5 * 1024 * 1024,
  defaultConcurrency: 3,
});
```

### Passo 2: criar upload

```ts
const localId = manager.createUpload(
  {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  },
  async (partSpec) => file.slice(partSpec.startByte, partSpec.endByteExclusive),
);
```

### Passo 3: iniciar e controlar

```ts
await manager.start(localId);
await manager.pause(localId);
await manager.resume(localId);
await manager.cancel(localId);
```

### Passo 4: observar eventos

```ts
manager.on("status", ({ localId, status, message }) => {
  console.log(localId, status, message);
});

manager.on("progress", ({ localId, pct }) => {
  console.log(localId, `${pct.toFixed(2)}%`);
});

manager.on("error", ({ localId, error }) => {
  console.error("upload error", localId, error);
});
```

## 8. Exemplo de adapter HTTP (estrutura)

```ts
import type { TransportAdapter } from "@flux-upload/core";

export class HttpTransportAdapter implements TransportAdapter {
  constructor(private readonly apiBaseUrl: string, private readonly authToken: string) {}

  async initUpload(input) {
    const response = await this.post("/uploads/init", {
      fileName: input.fileMeta.name,
      fileSize: input.fileMeta.size,
      contentType: input.fileMeta.type ?? "application/octet-stream",
      lastModified: input.fileMeta.lastModified ?? Date.now(),
      chunkSize: input.chunkSize,
    });
    return { uploadId: response.uploadId };
  }

  async getUploadedParts({ uploadId }) {
    const response = await this.get(`/uploads/${uploadId}/status`);
    return response.uploadedParts ?? [];
  }

  async signPart({ uploadId, partNumber }) {
    const response = await this.post(`/uploads/${uploadId}/parts/sign`, { partNumber });
    const match = response.urls.find((item) => item.partNumber === partNumber);
    return { url: match.url, expiresAt: match.expiresAt };
  }

  async uploadPart({ url, getPartData }) {
    const body = await getPartData();
    const response = await fetch(url, { method: "PUT", body });
    const etag = response.headers.get("etag")?.replace(/^\"|\"$/g, "").trim();
    return { etag };
  }

  async commitParts({ uploadId, parts }) {
    await this.post(`/uploads/${uploadId}/parts/commit`, { parts });
  }

  async completeUpload({ uploadId, parts }) {
    await this.post(`/uploads/${uploadId}/complete`, parts?.length ? { parts } : { useCommittedParts: true });
  }

  async abortUpload({ uploadId }) {
    await this.post(`/uploads/${uploadId}/abort`, {});
  }

  private async get(path: string): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.json();
  }

  private async post(path: string, body: unknown): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return response.status === 204 ? undefined : response.json();
  }
}
```

## 9. Retomada apos refresh/restart

Fluxo recomendado:
1. carregue estados persistidos com `rehydratePersistedUploads()`;
2. rebind do provider para cada upload que precisa continuar (`bindPartDataProvider`);
3. chame `resume(localId)` quando o arquivo estiver novamente disponivel.

Observacao importante:
- sem `partDataProvider`, iniciar/resumir falha com `MissingPartDataProviderError`.

## 10. Retry e erros

O core aplica retry nas operacoes de rede com:
- exponential backoff;
- jitter;
- cancelamento via `AbortSignal`.

Defaults internos do retry:
- `maxRetries: 3`
- `baseDelayMs: 150`
- `maxDelayMs: 5000`

Comportamento padrao:
- erros com `fatal: true` nao sao retentados;
- `AbortError` nao e retentado.

## 11. Boas praticas

- Para S3 multipart, use `chunkSize >= 5 MiB` (regra do provider, nao do core).
- Escolha `chunkSize` e `concurrency` conforme rede/memoria do cliente.
- Exponha e persista `etag` por parte quando possivel.
- Trate `status=expired` como sessao invalida e crie novo upload.
- Limpe estados persistidos antigos quando fizer sentido no seu produto.

## 12. Integracao com outros pacotes do monorepo

- `@flux-upload/react`: provider + hooks headless sobre este core.
- `@flux-upload/ui-shadcn`: UI pronta em cima de `@flux-upload/react`.
- `@flux-upload/nest`: control plane para backend multipart S3-compatible.

## 13. Desenvolvimento local

No monorepo:

```bash
pnpm -C packages/core typecheck
pnpm -C packages/core test
pnpm -C packages/core build
```
