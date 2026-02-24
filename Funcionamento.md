# Flux Upload – Funcionamento Técnico

Este documento descreve tecnicamente como o Flux Upload opera, detalhando o fluxo completo de upload multipart, a arquitetura do sistema e a separação entre plano de controle e plano de dados.

---

# 1. Visão Geral da Arquitetura

O Flux Upload é composto por quatro camadas principais:

- `@flux-upload/core` – Motor de upload resiliente (agnóstico de UI e storage)
- `@flux-upload/react` – Integração React (Provider + hooks)
- `@flux-upload/ui-shadcn` – Camada visual opcional
- `@flux-upload/nest` – Control Plane backend (sessões + presigned URLs)

Infraestrutura externa:

- Storage S3-compatible (MinIO ou AWS S3)
- Banco de dados (PostgreSQL via Prisma)

A arquitetura separa claramente:

- Control Plane → Backend (gerencia sessão e autorização)
- Data Plane → Storage (recebe os dados binários)

O backend nunca manipula o conteúdo do arquivo.

---

# 2. Fluxo Completo de Upload (Passo a Passo)

## Etapa 1 – Inicialização da Sessão

Frontend chama:

POST /uploads/init

O backend:

1. Valida autenticação
2. Gera `uploadId`
3. Chama `createMultipartUpload` no S3/MinIO
4. Persiste sessão no banco
5. Retorna:
   - uploadId
   - chunkSize
   - expiresAt
   - bucket
   - objectKey

---

## Etapa 2 – Planejamento das Partes (Chunking)

O `@flux-upload/core`:

1. Recebe `fileMeta`
2. Divide o arquivo em partes usando `chunkSize`
3. Gera uma lista de `PartSpec`:

Exemplo:

Arquivo: 100MB  
ChunkSize: 10MB  
Total de partes: 10

Cada parte contém:

- partNumber
- startByte
- endByteExclusive

---

## Etapa 3 – Assinatura de Parte

Para cada parte:

POST /uploads/:uploadId/parts/sign

O backend:

- Gera uma URL pré-assinada
- Define tempo de expiração
- Permite apenas PUT daquela parte específica

Retorna:

```

{
"partNumber": 1,
"url": "[https://minio/](https://minio/)...",
"expiresAt": "..."
}

```

---

## Etapa 4 – Upload Direto ao Storage

O frontend envia a parte diretamente ao storage:

PUT presigned-url

Características:

- Não envia Authorization
- Não passa pelo backend
- Envia apenas o binário

O storage responde com:

ETag: "hash-da-parte"

O ETag é capturado pelo core.

---

## Etapa 5 – Commit da Parte

Frontend informa ao backend:

POST /uploads/:uploadId/parts/commit

Body:

```

{
"parts": [
{ "partNumber": 1, "etag": "abc123" }
]
}

```

O backend persiste no banco:

- partNumber
- etag
- tamanho (opcional)

---

## Etapa 6 – Finalização do Upload

Quando todas as partes forem confirmadas:

POST /uploads/:uploadId/complete

O backend chama:

completeMultipartUpload()

O storage consolida as partes em um único objeto final.

Status da sessão passa para:

completed

---

# 3. Componentes Internos do Core

## UploadManager

Orquestra múltiplos uploads simultâneos.

## UploadTask

Representa um upload individual.

Responsável por:

- Controle de estado
- Execução das partes
- Retry
- Pause / Resume
- Persistência

## ChunkPlanner

Calcula os intervalos de bytes de cada parte.

## Scheduler

Controla concorrência:

Exemplo:

concurrency = 3  
No máximo 3 partes enviadas simultaneamente.

## RetryPolicy

Implementa:

- Backoff exponencial
- Jitter
- Cancelamento via AbortController

## PersistenceAdapter

Permite persistência em:

- IndexedDB (browser)
- Memory
- Outras implementações futuras

---

# 4. Pause e Resume

## Pause

- Cancela requisições ativas
- Mantém sessão no backend
- Persiste estado no client
- Status → paused

## Resume

1. Consulta backend: GET /uploads/:id/status
2. Reconcilia partes já enviadas
3. Envia apenas as partes faltantes

---

# 5. Comportamento em Caso de Reload ou Queda

Se ocorrer:

- Reload
- Crash do navegador
- Queda de energia
- Perda de conexão

O sistema:

1. Já persistiu estado no IndexedDB
2. Ao reiniciar, carrega uploads pendentes
3. Consulta backend para reconciliar partes
4. Exibe como pausado/interrompido
5. Solicita reanexar o arquivo
6. Retoma do ponto correto

O upload não reinicia do zero.

Observação: o navegador não permite recuperar automaticamente o File sem interação do usuário.

---

# 6. Segurança

## Separação Control Plane vs Data Plane

Backend:

- Autentica
- Autoriza
- Gera URLs
- Finaliza multipart

Frontend:

- Envia dados direto ao storage

O backend nunca manipula binário.

---

## URLs Pré-Assinadas

Incluem:

- Assinatura criptográfica
- Timestamp
- Expiração
- Permissão restrita a uma ação

Expiram automaticamente.

---

## Credenciais

Somente o backend possui:

S3_ACCESS_KEY  
S3_SECRET_KEY  

Nunca expostas ao frontend.

---

# 7. Escalabilidade

Sem presigned URLs:

Cliente → Backend → Storage

Com Flux Upload:

Cliente → Storage  
Cliente → Backend (controle)

Benefícios:

- Backend não processa GB de dados
- Menor uso de banda do servidor
- Escalabilidade horizontal simplificada

---

# 8. Adequação para Ambientes TRE

A arquitetura é compatível com ambientes Trusted Research Environment:

- Isolamento de storage
- Controle de identidade
- Auditoria por ownerId
- Sessões rastreáveis
- Possibilidade de integração com OIDC/Keycloak
- Não exposição de credenciais

Ideal para dados científicos sensíveis.

---

# 9. Resumo Técnico

O Flux Upload implementa um sistema de upload multipart resiliente com:

- Persistência local
- Reconciliação com backend
- Controle de concorrência
- Retry robusto
- Presigned URLs
- Separação clara entre plano de controle e plano de dados

Projetado para ambientes institucionais, escaláveis e seguros.

