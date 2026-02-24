# @flux-upload/ui-shadcn

Camada de UI pronta (skin) para o ecossistema Flux Upload.

Este pacote:
- consome `@flux-upload/react`;
- usa componentes estilo shadcn (Radix + Tailwind classes);
- entrega um painel completo de uploads com acoes de pause/resume/cancel/reconnect.

Este pacote **nao** implementa engine de upload.  
O engine vem de `@flux-upload/core` + `@flux-upload/react`.

## 1. O que voce recebe

Componentes principais:
- `FluxUploadPanel`: painel pronto para uso.
- `UploadListView`: lista de uploads (headless UI layer).
- `UploadRow`: linha individual de upload.
- `ReconnectFileDialog`: dialog para reconectar arquivo.

Componentes base exportados:
- `Button`, `Badge`, `Card`, `Dialog`, `Progress`, `Input`, `cn`.

Utils de status exportados:
- `getUploadUiStatus`
- `getUploadProgressPct`
- `canPause`
- `canCancel`
- `canResume`
- `formatBytes`

## 2. Dependencias e pre-requisitos

- `react >= 18`
- `react-dom >= 18`
- `@flux-upload/react` (que depende de `@flux-upload/core`)
- Tailwind CSS no app host (recomendado; sem Tailwind a UI fica sem estilo)
- `FluxUploadProvider` acima dos componentes da UI

## 3. Instalacao

```bash
pnpm add @flux-upload/ui-shadcn @flux-upload/react @flux-upload/core
```

Se voce ja usa `@flux-upload/react` e `@flux-upload/core`, instale apenas:

```bash
pnpm add @flux-upload/ui-shadcn
```

## 4. Configuracao de Tailwind

Como os componentes usam classes utilitarias, o Tailwind precisa enxergar os arquivos do pacote.

### 4.1 Monorepo (workspace local)

Adicione o caminho do pacote no `content`:

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui-shadcn/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

### 4.2 Pacote instalado via npm

Adicione o path em `node_modules`:

```ts
// tailwind.config.ts
content: [
  './app/**/*.{js,ts,jsx,tsx,mdx}',
  './src/**/*.{js,ts,jsx,tsx,mdx}',
  './node_modules/@flux-upload/ui-shadcn/dist/**/*.{js,ts,jsx,tsx}',
]
```

## 5. Uso basico (pronto para producao de UI)

```tsx
'use client';

import { FluxUploadProvider } from '@flux-upload/react';
import { FluxUploadPanel } from '@flux-upload/ui-shadcn';

export function UploadsScreen({ manager }: { manager: any }) {
  return (
    <FluxUploadProvider manager={manager}>
      <FluxUploadPanel title="Uploads" />
    </FluxUploadProvider>
  );
}
```

Observacao:
- Em Next.js/App Router, use em Client Component (`'use client'`).

## 6. `FluxUploadPanel` (API)

Props:
- `title?: string` (default: `"Uploads"`)
- `emptyMessage?: string`
- `showGlobalActions?: boolean` (default: `true`)
- `className?: string`
- `labels?: Partial<FluxUploadPanelLabels>`
- `onFileMismatch?: (info: FileMismatchInfo) => void`

`onFileMismatch` recebe:
- `localId`
- `error`
- `file`

Uso com customizacao:

```tsx
<FluxUploadPanel
  title="Envio de arquivos"
  showGlobalActions
  labels={{
    emptyMessage: 'Nenhum upload ainda.',
    uploading: 'Enviando',
    paused: 'Pausado',
    completed: 'Concluido',
    reconnect: 'Reconectar',
    bindAndResume: 'Reconectar e retomar',
  }}
  onFileMismatch={(info) => {
    console.error('Arquivo nao corresponde:', info.localId, info.error);
  }}
/>
```

## 7. Estados e comportamento visual

`UploadRow` converte o estado do `@flux-upload/react` para status de UI:
- `queued`
- `uploading`
- `paused`
- `error`
- `completed`
- `canceled`
- `expired`
- `needs-reconnect`

Acoes exibidas automaticamente por status:
- `Resume` quando pode retomar (`queued`, `paused`, `error`, `needs-reconnect`)
- `Pause` quando `running`
- `Cancel` enquanto nao terminal
- `Reconnect` quando `needs-reconnect`

## 8. Reconectar arquivo (resume after refresh)

Quando `runtime.needsReconnect = true`, o `UploadRow` abre `ReconnectFileDialog`.

Fluxo padrao:
1. usuario escolhe arquivo no dialog;
2. UI chama `actions.bindFile(localId, file)`;
3. UI chama `actions.resume(localId)`.

Se o arquivo nao corresponder (nome/tamanho/lastModified), o erro `FILE_MISMATCH` aparece e o callback `onFileMismatch` e disparado.

## 9. Usar componentes de nivel mais baixo

Se quiser controlar layout total, use `useFluxUpload()` do `@flux-upload/react` com:
- `UploadListView`
- `UploadRow`
- `ReconnectFileDialog`

Exemplo:

```tsx
'use client';

import { useFluxUpload } from '@flux-upload/react';
import { UploadListView } from '@flux-upload/ui-shadcn';

export function CustomUploadList() {
  const { uploads, actions } = useFluxUpload();

  return (
    <UploadListView
      uploads={uploads}
      actions={actions}
      emptyMessage="Sem uploads."
      labels={{
        emptyMessage: 'Sem uploads.',
        queued: 'Na fila',
        uploading: 'Enviando',
        paused: 'Pausado',
        error: 'Erro',
        completed: 'Concluido',
        canceled: 'Cancelado',
        expired: 'Expirado',
        expiredHint: 'Sessao expirada. Inicie novo upload.',
        needsReconnect: 'Precisa reconectar',
        resume: 'Retomar',
        pause: 'Pausar',
        cancel: 'Cancelar',
        reconnect: 'Reconectar',
        resumeAll: 'Retomar todos',
        pauseAll: 'Pausar ativos',
        refresh: 'Atualizar',
        progressLabel: 'Progresso',
        reconnectTitle: 'Reconectar arquivo',
        reconnectDescription: 'Selecione o mesmo arquivo original.',
        chooseFile: 'Escolher arquivo',
        bindAndResume: 'Reconectar e retomar',
        mismatchPrefix: 'Arquivo nao corresponde',
      }}
    />
  );
}
```

## 10. Internacionalizacao (labels)

Todas as labels de `FluxUploadPanel` sao sobrescreviveis via `labels`.

Tipo:
- `FluxUploadPanelLabels`

Campos principais:
- `queued`, `uploading`, `paused`, `error`, `completed`, `canceled`, `expired`
- `resume`, `pause`, `cancel`, `reconnect`
- `resumeAll`, `pauseAll`, `refresh`
- `reconnectTitle`, `reconnectDescription`, `bindAndResume`, `mismatchPrefix`

## 11. Exemplo completo recomendado

```tsx
'use client';

import { FluxUploadProvider } from '@flux-upload/react';
import { FluxUploadPanel } from '@flux-upload/ui-shadcn';

import { manager } from './upload-manager';

export default function UploadsPage() {
  return (
    <FluxUploadProvider manager={manager}>
      <main className="mx-auto max-w-5xl p-6">
        <FluxUploadPanel
          title="Flux Upload"
          labels={{
            emptyMessage: 'Nenhum upload criado.',
            queued: 'Na fila',
            uploading: 'Enviando',
            paused: 'Pausado',
            error: 'Erro',
            completed: 'Concluido',
            canceled: 'Cancelado',
            expired: 'Expirado',
            expiredHint: 'Sessao expirada. Crie um novo upload.',
            needsReconnect: 'Precisa reconectar',
            resume: 'Retomar',
            pause: 'Pausar',
            cancel: 'Cancelar',
            reconnect: 'Reconectar',
            resumeAll: 'Retomar todos',
            pauseAll: 'Pausar ativos',
            refresh: 'Atualizar',
            progressLabel: 'Progresso',
            reconnectTitle: 'Reconectar arquivo',
            reconnectDescription: 'Selecione o mesmo arquivo original.',
            chooseFile: 'Escolher arquivo',
            bindAndResume: 'Reconectar e retomar',
            mismatchPrefix: 'Arquivo nao corresponde',
          }}
        />
      </main>
    </FluxUploadProvider>
  );
}
```

## 12. Troubleshooting

- Painel vazio mesmo com uploads em andamento:
  - confirme que existe `FluxUploadProvider` acima da UI.
- UI sem estilos:
  - confirme `content` do Tailwind inclui o pacote.
- Erro de hooks em Next.js:
  - renderize em componente cliente (`'use client'`).
- Reconnect falhando:
  - confirme que o arquivo escolhido e exatamente o mesmo (nome/tamanho/lastModified).

## 13. Desenvolvimento no monorepo

```bash
pnpm -C packages/ui-shadcn typecheck
pnpm -C packages/ui-shadcn test
pnpm -C packages/ui-shadcn build
```
