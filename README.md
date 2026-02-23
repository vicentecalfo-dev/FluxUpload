# Flux Upload

## 1. Descrição
Flux Upload é um monorepo TypeScript para upload multipart/resumable com URLs pré-assinadas.

O projeto separa claramente:
- motor de upload no frontend (agnóstico de UI e storage);
- integração React headless;
- UI opcional pronta para uso;
- módulo NestJS de control plane para multipart em storage S3-compatible.

No fluxo adotado, o backend não recebe os bytes do arquivo. O frontend envia diretamente para o storage (MinIO/S3) usando URLs assinadas.

## 2. Arquitetura Geral

### 2.1 Pacotes
- `@flux-upload/core`
  - Motor de upload.
  - Planejamento de chunks, concorrência, pause/resume, retry, eventos e persistência via adapter.
- `@flux-upload/react`
  - Integração React headless.
  - Provider, hooks e bind/rebind de arquivo para retomada após refresh.
- `@flux-upload/ui-shadcn`
  - Camada de UI opcional baseada em estilo shadcn.
  - Painel de uploads com progresso e ações (retomar, pausar, cancelar, reconectar).
- `@flux-upload/nest`
  - Módulo NestJS para control plane multipart com Prisma + Postgres.
  - Gera URLs pré-assinadas e controla sessão/partes.

### 2.2 Apps de demonstração
- `apps/demo-backend`: host NestJS do módulo `@flux-upload/nest`.
- `apps/demo-frontend`: app Next.js 14 consumindo `core`, `react` e `ui-shadcn`.

### 2.3 Infra local
- `infra/docker-compose.yml`:
  - Postgres
  - MinIO
  - init automático de bucket e CORS via `mc`

### 2.4 Fluxo técnico (ponta-a-ponta)
1. `init`: frontend solicita criação da sessão de upload no backend.
2. `sign`: frontend solicita URL pré-assinada de uma parte.
3. `upload direto`: frontend faz `PUT` da parte no MinIO/S3 (sem passar bytes pelo backend).
4. `commit`: frontend informa ao backend as partes confirmadas (partNumber + ETag).
5. `complete`: backend finaliza o multipart no storage.

### 2.5 Separação Control Plane vs Data Plane
- Control Plane (backend Nest):
  - gerencia identidade, autorização, criação de sessão de upload e emissão de URLs pré-assinadas;
  - controla estado do upload (`init`, `sign`, `commit`, `complete`, `abort`) e metadados de rastreabilidade;
  - aplica regras de ownership (por exemplo, `ownerId`) para restringir operações por identidade.
- Data Plane (frontend + storage):
  - frontend envia bytes diretamente ao storage S3-compatible por `PUT` em URL pré-assinada;
  - transferência binária não atravessa o backend;
  - backend não manipula payload binário de arquivos.

### 2.6 Segurança e Governança
- Credenciais de storage não são expostas ao cliente; apenas URLs pré-assinadas temporárias são entregues ao frontend.
- URLs pré-assinadas têm expiração curta, reduzindo janela de uso indevido.
- O controle por identidade (`ownerId`) permite limitar sessão e consulta de upload por titular autorizado.
- O modelo favorece trilha de auditoria de eventos de upload (início, partes confirmadas, conclusão e aborto).
- A arquitetura é compatível com execução em ambientes isolados, com políticas de rede restritivas e segregação de responsabilidades.

## Uso em ambientes Trusted Research Environment (TRE)

### Definição técnica de TRE
Trusted Research Environment (TRE) é um ambiente computacional controlado para processamento de dados sensíveis, com requisitos de isolamento, governança de acesso, rastreabilidade e conformidade regulatória.

Em um TRE, a política de segurança normalmente exige:
- segregação entre componentes de controle e transferência de dados;
- identidade forte e autorização contextual;
- auditoria completa de operações;
- minimização da exposição de credenciais e superfície de ataque.

### Aderência arquitetural do Flux Upload ao modelo TRE
O Flux Upload foi concebido com separação explícita entre Control Plane e Data Plane, alinhada ao padrão operacional de TRE:
- o backend atua como plano de controle, autorizando e orquestrando uploads;
- o upload dos bytes ocorre diretamente para o storage isolado via URL pré-assinada;
- credenciais permanentes do storage permanecem restritas ao backend e à infraestrutura.

Esse desenho reduz acoplamento, simplifica inspeção de segurança e facilita evolução para cenários institucionais com políticas rígidas de governança.

### Vantagens do uso de presigned URLs em ambiente controlado
- Delegação mínima de permissão: o cliente recebe somente autorização temporária e escopada por objeto/parte.
- Redução de risco operacional: não há necessidade de distribuir chave de acesso S3 para aplicações cliente.
- Escalabilidade de transferência: tráfego de dados vai direto ao storage, preservando backend para regras de negócio e controle.
- Melhor controle de expiração e revogação operacional de sessões.

### Integrações institucionais suportadas pelo modelo
O desenho atual é compatível com evolução para:
- federação de identidade com Keycloak/OIDC;
- autorização baseada em identidade, escopo e contexto do estudo/projeto;
- auditoria de uploads por usuário, sessão, objeto e timestamp;
- encaminhamento de eventos para trilhas de log imutáveis (WORM/SIEM);
- criptografia no storage (server-side e, quando necessário, client-side).

### Adequação para dados científicos sensíveis
Para cenários de pesquisa com dados de saúde, genômica, dados administrativos ou outras categorias sensíveis, a arquitetura do Flux Upload contribui para:
- aderência a princípios de minimização e segregação de acesso;
- maior rastreabilidade para governança e compliance;
- compatibilidade com requisitos de LGPD, políticas institucionais e comitês de governança de dados.

Embora o repositório atual ofereça um baseline técnico, a adoção em produção TRE deve complementar controles de IAM, criptografia, observabilidade, política de retenção e processos de auditoria institucional.

## 3. Pré-requisitos
- Node.js: recomendado `>= 20.11.0` (LTS).
- pnpm: recomendado `>= 9`.
- Docker Engine: versão recente com suporte a Compose.
- Docker Compose CLI: `docker compose` habilitado.

Verificação rápida:

```bash
node -v
pnpm -v
docker -v
docker compose version
```

## 4. Instalação

```bash
git clone <URL_DO_REPOSITORIO>
cd FluxUpload
pnpm install
```

## 5. Subindo a Infraestrutura

Entre na pasta de infraestrutura e suba os serviços:

```bash
cd infra
docker compose up -d
```

Serviços esperados:
- Postgres: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Credenciais padrão do MinIO:
- usuário: `minioadmin`
- senha: `minioadmin`

O `docker-compose.yml` já executa um container de init (`minio-init`) que:
- cria o bucket `flux-upload`;
- aplica CORS com base em `infra/minio/cors.json`.

Verificar Postgres:

```bash
docker compose ps postgres
docker compose logs postgres --tail=50
```

Se preferir a partir da raiz do monorepo:

```bash
pnpm demo:infra
```

## 6. Configuração do Backend (demo-backend)

### 6.1 Arquivo de ambiente

```bash
cp apps/demo-backend/.env.example apps/demo-backend/.env
```

### 6.2 Variáveis de ambiente
- `PORT`: porta HTTP do backend demo.
- `DATABASE_URL`: conexão PostgreSQL usada pelo Prisma.
- `AUTH_TOKEN`: token Bearer aceito pelo AuthGuard MVP.
- `CORS_ORIGIN`: origem permitida para o frontend demo.
- `S3_BUCKET`: bucket alvo no MinIO/S3.
- `S3_REGION`: região lógica do S3 client.
- `S3_ENDPOINT`: endpoint S3-compatible (ex.: MinIO local).
- `S3_ACCESS_KEY`: access key do storage.
- `S3_SECRET_KEY`: secret key do storage.
- `S3_FORCE_PATH_STYLE`: `true` para compatibilidade com MinIO local.
- `UPLOAD_DEFAULT_CHUNK_SIZE`: chunk padrão (bytes).
- `UPLOAD_SESSION_TTL_HOURS`: expiração da sessão de upload.
- `PRESIGN_EXPIRES_SECONDS`: validade da URL pré-assinada.
- `OBJECT_KEY_PREFIX`: prefixo de chave no bucket.

### 6.3 Migrations do Prisma

Comando solicitado (na raiz do monorepo):

```bash
pnpm --filter @flux-upload/nest exec prisma migrate dev --name init --schema=prisma/schema.prisma
```

Comando recomendado adicional para gerar client Prisma do package:

```bash
pnpm --filter @flux-upload/nest exec prisma generate --schema=prisma/schema.prisma
```

Se quiser usar o atalho do projeto:

```bash
pnpm demo:db:migrate
```

## 7. Rodando o Backend Demo

```bash
cd apps/demo-backend
pnpm run start:dev
```

Endpoints úteis:
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api`

Opcional (a partir da raiz):

```bash
pnpm demo:backend
```

## 8. Configuração do Frontend (demo-frontend)

```bash
cp apps/demo-frontend/.env.example apps/demo-frontend/.env.local
```

Variáveis:
- `NEXT_PUBLIC_API_BASE_URL`
  - Base da API backend consumida pelo adapter HTTP do upload.
  - Exemplo: `http://localhost:4000`.
- `NEXT_PUBLIC_AUTH_TOKEN`
  - Token Bearer enviado nas chamadas do frontend para o backend.
  - Deve corresponder ao `AUTH_TOKEN` do backend.

## 9. Rodando o Frontend Demo

```bash
cd apps/demo-frontend
pnpm dev
```

Acesso:
- Home: `http://localhost:3000`
- Uploads: `http://localhost:3000/uploads`

Opcional (a partir da raiz):

```bash
pnpm demo:frontend
```

## 10. Testando o Fluxo de Upload
1. Acesse `http://localhost:3000/uploads`.
2. Clique em `Adicionar arquivos` e selecione um ou mais arquivos.
3. Verifique a criação dos uploads e atualização de progresso.
4. Use `Pausar` para interromper.
5. Use `Retomar` para continuar.
6. Atualize a página para validar restauração de estado via IndexedDB.
7. Se o arquivo precisar ser reanexado, use `Reconectar arquivo` e selecione o mesmo arquivo.
8. Ao final, confirme status `Concluído`.

## 11. Estrutura do Repositório

```text
flux-upload/
  package.json
  pnpm-workspace.yaml
  README.md
  infra/
    docker-compose.yml
    minio/
      cors.json
  apps/
    demo-backend/
      src/
      .env.example
    demo-frontend/
      app/
      src/flux/
      .env.example
  packages/
    core/
      src/
    react/
      src/
    ui-shadcn/
      src/
    nest/
      src/
      prisma/
        schema.prisma
```

## 12. Observações Importantes
- CORS no bucket é obrigatório para upload direto do navegador.
- URLs pré-assinadas expiram; partes assinadas fora da janela de validade falham.
- O backend não recebe bytes de arquivo neste desenho.
- O upload é direto para MinIO/S3 por `PUT` nas URLs assinadas.
- Para leitura de `ETag` no frontend, o CORS deve expor o header `ETag`.

## 13. Problemas Comuns

### 13.1 Erro de `DATABASE_URL`
Sintoma: falha ao iniciar backend/migrations.

Verifique:
- Postgres ativo (`docker compose ps`).
- URL correta em `apps/demo-backend/.env`.
- banco `flux_upload` criado (o compose já cria via `POSTGRES_DB`).

### 13.2 Erro de `AUTH_TOKEN`
Sintoma: respostas `401 Unauthorized` no frontend.

Verifique:
- `AUTH_TOKEN` no backend.
- `NEXT_PUBLIC_AUTH_TOKEN` no frontend.
- Ambos precisam ter o mesmo valor.

### 13.3 Erro de CORS
Sintoma: bloqueio no navegador em chamadas para MinIO ou backend.

Verifique:
- `CORS_ORIGIN=http://localhost:3000` no backend.
- CORS do bucket aplicado (`infra/minio/cors.json`).
- frontend rodando exatamente na origem permitida.

### 13.4 Erro de ETag não exposto
Sintoma: upload da parte retorna sucesso, mas commit falha por ETag ausente.

Verifique:
- `ExposeHeaders` no CORS do bucket contém `ETag`.
- resposta do `PUT` no MinIO inclui header `ETag`.

### 13.5 Warning do pnpm sobre versão
Sintoma: aviso sobre `pnpm@latest` no `packageManager`.

Impacto: normalmente não bloqueia execução.

Mitigação opcional:
- definir versão fixa no `package.json` (ex.: `pnpm@9.x`).

## 14. Scripts úteis na raiz

```bash
pnpm demo:infra
pnpm demo:db:migrate
pnpm demo:backend
pnpm demo:frontend
```

## 15. Licença
MIT.
