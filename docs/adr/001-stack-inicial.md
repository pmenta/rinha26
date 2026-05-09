# ADR-001 — Stack inicial: Bun + Elysia + DDD/Hexagonal + Nx + Vitest

| Campo         | Valor                                              |
|---------------|----------------------------------------------------|
| **Status**    | `accepted`                                         |
| **Decisores** | Spicy (humano + agente Claude Sonnet 4.x)         |
| **Data**      | 2026-05-09                                         |
| **Tags**      | `arquitetura`, `infra`, `dx`                       |

## Contexto

A Rinha de Backend 2026 (`docs/README.md`) exige um backend de detecção de fraude
por busca vetorial KNN, com restrições rígidas:

- p99 baixo é crítico (cada 10× de melhoria vale +1000 pontos no
  `score_p99`, satura em 1ms; piso em −3000 quando p99 > 2000ms).
- Limites: 1 CPU + 350 MB total para LB + N réplicas.
- `linux/amd64`, `bridge` net, imagens públicas.

Como esta é uma plataforma de experimentação onde queremos comparar **várias
implementações** (de busca vetorial, de stack HTTP, de pré-processamento de
dataset), precisamos de uma fundação que:

1. Permita componentizar implementações (DDD/Hexagonal com ports/adapters).
2. Tenha runtime rápido para hot-path HTTP (Bun > Node em latência).
3. Tenha test runner maduro para TDD em grande velocidade (XP — `Akita, 2026`).
4. Permita `nx affected` para CI rápido.

## Decisão

Adotar:

- **Bun 1.1.x** como package manager (`bun install`, workspaces) **e** runtime
  (Bun.serve, Bun.file, gunzip via `DecompressionStream`).
- **TypeScript ESM strict** (`nodenext`, `customConditions: ["@rinha26/source"]`).
- **Elysia.js** como HTTP framework (Bun-native, type-safe, suporta
  Standard Schema).
- **DDD + Arquitetura Hexagonal** com ports/adapters espelhados:
  - `packages/core` (domínio + aplicação + ports + adapters fakes).
  - `packages/vector-store` (implementações reais de `VectorIndexPort`).
  - `apps/api` (inbound HTTP).
- **Nx 22** como orquestrador de monorepo (`nx affected`, plugins
  `@nx/js/typescript`, `@nx/vite`, `@nx/eslint`, `@nx/vitest`).
- **Vitest 3.x** como test runner (plugin oficial Nx, coverage v8, UI).
- **Zod 4.x** para validação de schemas na borda.
- **typescript-monads** (`IResult<T, E>`) para erros tipados em union via `_tag`.
- **ESLint flat config** com `@nx/enforce-module-boundaries` (tags `scope:*`).

## Alternativas consideradas

- **Node 22 + Fastify** — alternativa "default". *Rejeitada* porque Bun
  oferece menor cold-start, melhor throughput em I/O-bound, e ergonomia
  nativa (`Bun.file().stream()`) para descompressão sem dep externa. Custo
  de risco mitigado pelo TDD agressivo.
- **`bun test`** em vez de Vitest — mais rápido. *Rejeitada* porque o
  ecossistema Nx 22 ainda não tem plugin oficial; perderíamos `nx affected`
  + cache. Vitest já é rápido o suficiente (49 testes em <500ms).
- **Hono** em vez de Elysia — popular para perf-tuning. *Aceitável como
  segunda implementação no futuro* (`apps/api-hono`), mas a versão inicial
  fica em Elysia por consistência com o monorepo `payrouter` (mesma equipe).
- **pnpm/npm** em vez de Bun como package manager — mais maduro. *Rejeitada*
  para evitar ter dois runtimes diferentes (lockfile, install, runtime). Bun
  é "um só" e mais rápido; usamos npm-compatible exports field.
- **Sem monorepo** (single package) — menos overhead. *Rejeitada* porque o
  objetivo do projeto é **comparar implementações** (várias de
  `VectorIndexPort`, possivelmente várias de API). Sem monorepo, isso vira
  fork ou sub-repo — pior para iteração.

## Consequências

### Positivas

- DDD/Hexagonal isola domínio de framework — `packages/core` é puro TS, sem
  Bun/Elysia/I/O. Facilita testes unitários ultra-rápidos.
- `nx affected` permite CI escalar com o monorepo (só roda o que mudou).
- ESLint module boundaries previnem dependência circular ou vazamento (ex.:
  `core` não consegue importar de `apps/api`).
- Bun runtime + `--smol` cabe nos 160 MB por réplica do compose.
- Bun-native `DecompressionStream` evita dep `zlib`/`pako`.

### Negativas / trade-offs

- Bun é mais novo e tem casos de incompatibilidade — já documentados em
  `AGENTS.md` §11 (custom conditions ignoradas, `--frozen-lockfile` quebra
  cross-platform, etc.).
- Usuários do projeto precisam ter Bun instalado (não Node puro).
- Nx adiciona ~120 deps de dev, mas todas isoladas em `node_modules` — não
  vão para o container final.

### Riscos

- Bun major upgrade (1.x → 2.0) pode quebrar — mitigado por pin no
  `package.json` (`packageManager: "bun@1.1.29"`).
- Elysia ainda evolui rápido (1.4 → 2.x) — mitigado por specs de rota
  cobrindo o contrato exposto.

## Implementação

- `package.json` (raiz) — `workspaces`, `packageManager: bun@1.1.29`.
- `nx.json` — plugins `@nx/js/typescript`, `@nx/vite`, `@nx/eslint`, `@nx/vitest`.
- `tsconfig.base.json` — `strict`, `nodenext`, `customConditions`.
- `eslint.config.mjs` — `enforce-module-boundaries` por `scope:*`.
- `packages/core`, `packages/vector-store`, `apps/api` — estrutura DDD/Hexagonal.

## Como revisitar

- Se Bun deixar de evoluir ou tiver crashes recorrentes em produção — voltar
  para Node + Fastify.
- Se `nx affected` parar de funcionar com Bun — considerar `pnpm`.
- Se Vitest ficar lento (>5s para a suite completa) — avaliar `bun test`
  novamente quando Nx tiver suporte.
