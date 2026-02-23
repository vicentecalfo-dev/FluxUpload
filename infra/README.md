# Infra (Demo E2E - Fase 6A)

Infraestrutura local para a demo ponta-a-ponta:
- Postgres (porta `5432`)
- MinIO S3-compatible (API em `9000`, console em `9001`)

## Credenciais padrao

Postgres:
- usuario: `postgres`
- senha: `postgres`
- database: `flux_upload`

MinIO:
- access key: `minioadmin`
- secret key: `minioadmin`
- console: `http://localhost:9001`

## Subir infra

```bash
docker compose -f infra/docker-compose.yml up -d
```

Ou via script do monorepo:

```bash
pnpm demo:infra
```

## Bucket e CORS (automatico)

O servico `minio-init` no compose cria o bucket `flux-upload` e aplica CORS usando
`infra/minio/cors.json`.

Para verificar logs:

```bash
docker logs flux-upload-minio-init
```

## Bucket e CORS (manual, fallback)

Se precisar repetir manualmente:

```bash
docker run --rm --network host -v "$(pwd)/infra/minio/cors.json:/tmp/cors.json:ro" minio/mc:RELEASE.2025-02-08T19-14-21Z \
  /bin/sh -c "\
    mc alias set local http://127.0.0.1:9000 minioadmin minioadmin && \
    mc mb --ignore-existing local/flux-upload && \
    mc cors set local/flux-upload /tmp/cors.json\
  "
```

## Proximo passo (backend demo)

1. Copie `apps/demo-backend/.env.example` para `apps/demo-backend/.env`.
2. Rode migration/generate com o schema do pacote `@flux-upload/nest`:

```bash
pnpm demo:db:migrate
```

3. Suba o backend de demo:

```bash
pnpm demo:backend
```

Backend: `http://localhost:4000`
Swagger: `http://localhost:4000/api`
