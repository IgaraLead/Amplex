# Amplex Web

Frontend do Amplex (React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + DaisyUI 5).

## Estrutura

| Caminho | Função |
|--------|--------|
| `src/main.tsx` | Bootstrap: React Query, Router, CSS global |
| `src/app/` | Shell da aplicação (`App.tsx`) e definição de rotas (`routes.tsx`) |
| `src/shared/` | API client, store (auth), branding, layout, UI (`Modal`, toasts, etc.) |
| `src/modules/` | Páginas por domínio (auth, dashboard, pipeline, leads, contacts, settings) |

Imports usam o alias `@/` → `src/` (ver `tsconfig.json` e `vite.config.ts`).

## Comandos

```bash
npm install
npm run dev      # http://localhost:3003 — proxy /amplex/api → backend
npm run build
npm run lint
npx tsc --noEmit
```
