# demo-frontend

App Next.js 14 (App Router) para testar o fluxo ponta-a-ponta do Flux Upload.

Usa:
- `@flux-upload/core`
- `@flux-upload/react`
- `@flux-upload/ui-shadcn`

## Setup

1. Copie o env:

```bash
cp apps/demo-frontend/.env.example apps/demo-frontend/.env.local
```

2. Instale dependencias no monorepo (na raiz):

```bash
pnpm install
```

3. Rode o frontend:

```bash
pnpm --filter demo-frontend dev
```

4. Acesse:

- Home: `http://localhost:3000`
- Uploads: `http://localhost:3000/uploads`

## Fluxo de teste

1. Clique em **Adicionar arquivos**.
2. Verifique progresso e acoes (pausar, retomar, cancelar).
3. Atualize a pagina.
4. Uploads pendentes devem permanecer listados.
5. Use **Reconectar** para selecionar novamente o arquivo e continuar.

## Teste de retomada robusta

1. Inicie upload de um arquivo grande (ex.: 200 MB ou mais).
2. Com upload em andamento, desconecte a rede (ou use modo offline do navegador).
3. O upload ativo deve ser pausado automaticamente com erro `OFFLINE`.
4. Reative a rede.
5. Atualize a pagina para simular refresh/crash.
6. O upload deve aparecer como pendente e, sem arquivo bound, em estado de reconexao.
7. Clique em **Reconectar** e selecione exatamente o mesmo arquivo (name, size e lastModified).
8. Clique em retomar; o sistema deve reconciliar partes enviadas com o backend e continuar apenas as faltantes.
9. Ao final, confirme status de upload concluido sem reiniciar do zero.

## Requisitos externos

- Backend demo ativo em `http://localhost:4000`.
- MinIO + Postgres ativos via `pnpm demo:infra`.
- Migrations aplicadas via `pnpm demo:db:migrate`.
