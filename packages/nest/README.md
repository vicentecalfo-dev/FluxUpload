# @flux-upload/nest

Modulo NestJS plugavel para control plane de uploads multipart usando storage
S3-compatible (AWS S3, MinIO, etc.) com presigned URLs.

Este pacote nao recebe bytes de arquivo no backend. O frontend envia partes
direto para o bucket via URLs assinadas.

## Instalacao

```bash
pnpm add @flux-upload/nest @prisma/client
pnpm add -D prisma
```

## Variaveis de ambiente

- `PORT`
- `DATABASE_URL`
- `AUTH_TOKEN`
- `CORS_ORIGIN`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` (opcional)
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_FORCE_PATH_STYLE` (opcional)
- `UPLOAD_DEFAULT_CHUNK_SIZE` (default `16777216`)
- `UPLOAD_SESSION_TTL_HOURS` (default `24`)
- `PRESIGN_EXPIRES_SECONDS` (default `900`)
- `OBJECT_KEY_PREFIX` (default `flux-upload`)

## Prisma

Schema e migracao inicial estao em `prisma/`.

```bash
pnpm -C packages/nest prisma:generate
pnpm -C packages/nest prisma:migrate -- --name init
```

## Uso no app Nest

```ts
import { Module } from '@nestjs/common';
import { FluxUploadModule } from '@flux-upload/nest';

@Module({
  imports: [FluxUploadModule.forRoot()],
})
export class AppModule {}
```

Opcionalmente, para configurar CORS e Swagger com helpers do pacote:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupFluxUploadFromEnv } from '@flux-upload/nest';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupFluxUploadFromEnv(app); // aplica CORS via CORS_ORIGIN + Swagger em /api
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

## Fluxo da API

1. `POST /uploads/init`
2. `POST /uploads/:uploadId/parts/sign`
3. Upload direto das partes para o storage (frontend -> S3/MinIO)
4. `POST /uploads/:uploadId/parts/commit`
5. `POST /uploads/:uploadId/complete`

Abortar:
- `POST /uploads/:uploadId/abort`

Consultar status:
- `GET /uploads/:uploadId/status`

## Observacoes importantes

- Configure CORS no bucket para permitir `PUT` nas URLs assinadas.
- URLs assinadas expiram em `PRESIGN_EXPIRES_SECONDS`.
- Sessoes expiram em `UPLOAD_SESSION_TTL_HOURS`.
