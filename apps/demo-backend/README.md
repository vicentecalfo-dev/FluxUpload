# demo-backend

Aplicacao Nest de demonstracao para hospedar o modulo `@flux-upload/nest`.

## Setup rapido

```bash
cp .env.example .env
pnpm demo:infra
pnpm demo:db:migrate
pnpm demo:backend
```

Endpoints:
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api`
