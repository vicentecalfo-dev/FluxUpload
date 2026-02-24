# @flux-upload/nest

Modulo NestJS para control plane de upload multipart com storage S3-compatible
(AWS S3, MinIO, etc.) usando presigned URLs.

O backend deste pacote nao recebe bytes do arquivo. Ele:
- cria sessao de multipart;
- assina URLs por parte;
- registra metadados/ETags;
- completa ou aborta upload.

Os bytes sao enviados pelo cliente direto para o bucket.

## 1. O que o pacote entrega

- `FluxUploadModule` com endpoints prontos:
  - `POST /uploads/init`
  - `POST /uploads/:uploadId/parts/sign`
  - `POST /uploads/:uploadId/parts/commit`
  - `GET /uploads/:uploadId/status`
  - `POST /uploads/:uploadId/complete`
  - `POST /uploads/:uploadId/abort`
- Integracao Prisma para persistir sessoes/partes.
- Auth guard simples via Bearer token (`AUTH_TOKEN`).
- Adapter S3-compatible padrao (`S3CompatibleAdapter`).
- Helpers para CORS e Swagger:
  - `setupFluxUploadCors`
  - `setupFluxUploadSwagger`
  - `setupFluxUploadFromEnv`

## 2. Instalacao

```bash
pnpm add @flux-upload/nest @prisma/client
pnpm add -D prisma
```

Peer dependencies esperadas:
- `@nestjs/common >= 10`
- `@nestjs/core >= 10`
- `@nestjs/config >= 3`
- `@nestjs/swagger >= 7`
- `rxjs >= 7`

## 3. Requisitos de banco (Prisma)

O pacote usa `PrismaClient` e espera os modelos de upload no schema.

Referencia pronta:
- `packages/nest/prisma/schema.prisma`
- `packages/nest/src/prisma/schema.prisma`

Se sua aplicacao ja tem schema proprio, copie/mescle:
- `UploadSession`
- `UploadPart`
- `UploadStatus`

Depois rode:

```bash
pnpm prisma generate
pnpm prisma migrate dev --name flux_upload_init
```

No monorepo deste projeto, os atalhos existentes sao:

```bash
pnpm -C packages/nest prisma:generate
pnpm -C packages/nest prisma:migrate -- --name init
```

## 4. Variaveis de ambiente

Obrigatorias:
- `DATABASE_URL`
- `AUTH_TOKEN`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

Com default:
- `PORT` (default `3000`)
- `CORS_ORIGIN` (default `*`)
- `S3_REGION` (default `us-east-1`)
- `UPLOAD_DEFAULT_CHUNK_SIZE` (default `16777216`, minimo `5242880`)
- `UPLOAD_SESSION_TTL_HOURS` (default `24`)
- `PRESIGN_EXPIRES_SECONDS` (default `900`)
- `OBJECT_KEY_PREFIX` (default `flux-upload`)

Opcionais:
- `S3_ENDPOINT` (para MinIO/local)
- `S3_FORCE_PATH_STYLE` (`true/false`, auto `true` se `S3_ENDPOINT` existir)

## 5. Setup rapido no Nest

### 5.1 AppModule

```ts
import { Module } from '@nestjs/common';
import { FluxUploadModule } from '@flux-upload/nest';

@Module({
  imports: [FluxUploadModule.forRoot()],
})
export class AppModule {}
```

### 5.2 bootstrap (`main.ts`)

```ts
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupFluxUploadFromEnv } from '@flux-upload/nest';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupFluxUploadFromEnv(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

## 6. Fluxo de uso (cliente -> API -> storage)

1. `init`: cliente cria sessao de upload.
2. `sign`: cliente pede URL assinada da parte.
3. cliente faz `PUT` direto no S3/MinIO.
4. `commit`: cliente confirma ETag da parte no backend.
5. `complete`: backend fecha multipart.

Fluxos auxiliares:
- `status`: retorna partes ja enviadas.
- `abort`: cancela multipart remoto e marca sessao como abortada.

## 7. Contratos HTTP (objetivo)

Todos endpoints exigem header:

```http
Authorization: Bearer <AUTH_TOKEN>
```

### 7.1 `POST /uploads/init`

Request:

```json
{
  "fileName": "video.mp4",
  "fileSize": 10485760,
  "contentType": "video/mp4",
  "lastModified": 1730228400000,
  "chunkSize": 5242880,
  "prefix": "tenant-a/invoices"
}
```

Response `201`:

```json
{
  "uploadId": "57094d4f-e1af-4fd8-81ba-a83f14dd5892",
  "chunkSize": 5242880,
  "expiresAt": "2026-02-25T12:00:00.000Z",
  "bucket": "flux-upload",
  "objectKey": "tenant-a/invoices/57094d4f-e1af-4fd8-81ba-a83f14dd5892/video.mp4"
}
```

Regras:
- `chunkSize` minimo para multipart: `5 MiB` (`5242880` bytes).

### 7.2 `POST /uploads/:uploadId/parts/sign`

Request (uma parte):

```json
{
  "partNumber": 1
}
```

Request (multiplas partes):

```json
{
  "partNumbers": [1, 2, 3]
}
```

Response `201`:

```json
{
  "urls": [
    {
      "partNumber": 1,
      "url": "https://...",
      "expiresAt": "2026-02-24T12:10:00.000Z"
    }
  ]
}
```

### 7.3 `POST /uploads/:uploadId/parts/commit`

Request:

```json
{
  "parts": [
    {
      "partNumber": 1,
      "etag": "9f620878e06d28774406017480a59fd4",
      "size": 5242880
    }
  ]
}
```

Response `204 No Content`.

### 7.4 `GET /uploads/:uploadId/status`

Response `200`:

```json
{
  "uploadId": "57094d4f-e1af-4fd8-81ba-a83f14dd5892",
  "status": "uploading",
  "expiresAt": "2026-02-25T12:00:00.000Z",
  "uploadedParts": [1, 2, 3]
}
```

### 7.5 `POST /uploads/:uploadId/complete`

Opcao A (parts inline):

```json
{
  "parts": [
    { "partNumber": 1, "etag": "etag-1" },
    { "partNumber": 2, "etag": "etag-2" }
  ]
}
```

Opcao B (usar partes ja commitadas):

```json
{
  "useCommittedParts": true
}
```

Response `201`:

```json
{
  "fileId": "57094d4f-e1af-4fd8-81ba-a83f14dd5892",
  "bucket": "flux-upload",
  "objectKey": "tenant-a/invoices/57094d4f-e1af-4fd8-81ba-a83f14dd5892/video.mp4"
}
```

Regra:
- envie **ou** `parts` **ou** `useCommittedParts=true`, nunca os dois.

### 7.6 `POST /uploads/:uploadId/abort`

Response `204 No Content`.

## 8. Exemplo end-to-end com curl

Defina variaveis:

```bash
API="http://localhost:4000"
TOKEN="dev-token"
```

1) Init:

```bash
curl -sS -X POST "$API/uploads/init" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName":"sample.bin",
    "fileSize":10485760,
    "contentType":"application/octet-stream",
    "lastModified":1730228400000,
    "chunkSize":5242880
  }'
```

2) Sign (uploadId vindo do passo anterior):

```bash
curl -sS -X POST "$API/uploads/<uploadId>/parts/sign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"partNumber":1}'
```

3) Upload da parte no URL assinado (fora da API Nest):

```bash
curl -sS -X PUT "<presignedUrl>" --data-binary "@part-1.bin" -D -
```

4) Commit:

```bash
curl -sS -X POST "$API/uploads/<uploadId>/parts/commit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"partNumber":1,"etag":"<etag-do-put>"}]}'
```

5) Complete:

```bash
curl -sS -X POST "$API/uploads/<uploadId>/complete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"useCommittedParts":true}'
```

## 9. Autenticacao e ownerId

O guard atual e propositalmente simples:
- exige `Bearer <token>`;
- token precisa ser exatamente igual a `AUTH_TOKEN`;
- `ownerId` e derivado do token:
  - se token tiver `:`, usa o trecho apos o primeiro `:`;
  - senao usa `mvp-user`.

Exemplo:
- `AUTH_TOKEN=dev-token:tenant-a` -> `ownerId=tenant-a`.

## 10. Extensibilidade: StorageAdapter custom

Voce pode substituir o adapter padrao (`S3CompatibleAdapter`) por um adapter proprio.

Contrato:

```ts
import type {
  StorageAdapter,
  StorageCompletedPart,
  StorageListedPart,
} from '@flux-upload/nest';

export class MyStorageAdapter implements StorageAdapter {
  async createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string> {
    return 'upload-id';
  }

  async signUploadPart(
    bucket: string,
    key: string,
    multipartUploadId: string,
    partNumber: number,
    expiresSeconds: number,
  ): Promise<string> {
    return 'https://signed-url';
  }

  async listParts(bucket: string, key: string, multipartUploadId: string): Promise<StorageListedPart[]> {
    return [];
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    multipartUploadId: string,
    parts: StorageCompletedPart[],
  ): Promise<void> {}

  async abortMultipartUpload(bucket: string, key: string, multipartUploadId: string): Promise<void> {}
}
```

Registro:

```ts
import { Module } from '@nestjs/common';
import { FluxUploadModule } from '@flux-upload/nest';
import { MyStorageAdapter } from './my-storage.adapter';

@Module({
  imports: [
    FluxUploadModule.forRoot({
      storageAdapter: MyStorageAdapter,
    }),
  ],
})
export class AppModule {}
```

## 11. `forRoot` vs `forRootAsync`

- `forRoot()`:
  - chama `ConfigModule.forRoot(...)` com validacao (`fluxUploadConfigValidationSchema`);
  - melhor opcao para servico dedicado.

- `forRootAsync()`:
  - nao chama `ConfigModule.forRoot` automaticamente;
  - use quando sua app ja inicializa `ConfigModule` em outro lugar.

Exemplo com `forRootAsync`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FluxUploadModule, fluxUploadConfigValidationSchema } from '@flux-upload/nest';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: fluxUploadConfigValidationSchema,
    }),
    FluxUploadModule.forRootAsync(),
  ],
})
export class AppModule {}
```

## 12. Erros e codigos HTTP comuns

- `400 Bad Request`
  - payload invalido;
  - `chunkSize < 5 MiB`;
  - `complete` com payload ambigua (`parts` + `useCommittedParts`).
- `401 Unauthorized`
  - token ausente/invalido.
- `404 Not Found`
  - sessao inexistente ou ownership diferente.
- `409 Conflict`
  - operacao em sessao abortada/completed;
  - sem partes para completar.
- `410 Gone`
  - sessao expirada.
- `500 Internal Server Error`
  - erro no storage (assinar/completar/abortar multipart).

## 13. Recomendacoes operacionais

- Configure CORS no bucket para `PUT` e leitura de header `ETag`.
- Mantenha `PRESIGN_EXPIRES_SECONDS` curto e ajuste retries no cliente.
- Use `chunkSize >= 5 MiB` para S3 multipart.
- Faça limpeza/expurgo de sessoes antigas no banco conforme sua politica.

## 14. Desenvolvimento no monorepo

```bash
pnpm -C packages/nest typecheck
pnpm -C packages/nest test
pnpm -C packages/nest build
```
