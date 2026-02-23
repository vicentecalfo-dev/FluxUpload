# Flux Upload

Flux Upload e um monorepo TypeScript para um ecossistema de upload de arquivos focado em
multipart/resumable upload com URLs pre-assinadas e um backend de control plane.

Pacotes iniciais:
- `@flux-upload/core`: contratos e primitives compartilhadas.
- `@flux-upload/react`: adaptadores e hooks para apps React.
- `@flux-upload/ui-shadcn`: componentes de UI baseados em shadcn/ui.
- `@flux-upload/nest`: integracao backend para Nest.js.

Este repositorio contem apenas o scaffold inicial. A logica de upload sera implementada depois.
