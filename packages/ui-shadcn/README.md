# @flux-upload/ui-shadcn

UI opcional (skin) para `@flux-upload/react`, com componentes no estilo shadcn/ui
implementados localmente com Radix UI + Tailwind classes.

## Pre-requisitos

- React 18+
- Tailwind CSS configurado no app host (recomendado para melhor visual)
- `FluxUploadProvider` em um nivel acima na arvore

## Uso rapido

```tsx
import { FluxUploadProvider } from '@flux-upload/react';
import { FluxUploadPanel } from '@flux-upload/ui-shadcn';

function App() {
  return (
    <FluxUploadProvider manager={manager}>
      <FluxUploadPanel title="Uploads" />
    </FluxUploadProvider>
  );
}
```

Este pacote nao implementa o engine de upload; ele apenas renderiza a interface e
consome os hooks/actions do `@flux-upload/react`.
