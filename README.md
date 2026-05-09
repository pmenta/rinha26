# `@rinha26` — Rinha de Backend 2026 (Spicy)

Submissão da equipe **Spicy** para a [Rinha de Backend 2026](./docs/README.md) —
**detecção de fraude por busca vetorial** sobre 3M vetores de 14 dimensões.

> Stack: **Bun + TypeScript** (ESM, strict) · **Nx 22** monorepo ·
> **Elysia.js** (HTTP) · **Vitest** (TDD) · **Zod** (validação) ·
> **DDD + Arquitetura Hexagonal** com ports/adapters espelhados.

> Disciplina: **XP** — pair programming com agente de IA, TDD, small releases,
> refactor contínuo, CI por commit. Inspirado em
> [Akita, 2026](https://akitaonrails.com/2026/02/20/do-zero-a-pos-producao-em-1-semana-como-usar-ia-em-projetos-de-verdade-bastidores-do-the-m-akita-chronicles/#o-claudemd-a-spec-que-evolui)
> e no monorepo `payrouter` (mesma equipe).

---

## Sumário

- [Como rodar](#como-rodar)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Documentação do desafio](#documentação-do-desafio)
- [Documentação para agentes](#documentação-para-agentes)
- [Roadmap](#roadmap)

---

## Como rodar

> **Pré-requisitos:** [Bun ≥ 1.1.29](https://bun.sh) e (opcional) [k6](https://k6.io)
> para rodar o smoke/avaliação. Docker virá na Fase 2.

```bash
# Instala dependências (Bun workspaces)
bun install

# Verifica todo o monorepo (lint + typecheck + test + build)
bun run verify

# Comandos individuais
bun run lint        # Nx run-many -t lint
bun run typecheck   # Nx run-many -t typecheck
bun run test        # Nx run-many -t test
bun run build       # Nx run-many -t build
bun run graph       # abre Nx graph no navegador

# Subset por projeto
bunx nx test core
bunx nx affected -t test    # só o que mudou desde `main`
```

A partir da Fase 2 será possível:

```bash
docker compose up --build
k6 run test/smoke.js        # smoke local
k6 run test/test.js         # avaliação oficial
```

---

## Estrutura do monorepo

```
.
├── packages/
│   ├── core/            # Domínio + use cases + ports + fakes (zero deps de framework)
│   └── vector-store/    # Implementações reais de VectorIndexPort (brute-force, KD-tree, …)
├── apps/
│   └── api/             # Bun + Elysia (HTTP adapter na porta 9999)
├── docs/                # Documentação OFICIAL do desafio
├── resources/           # Datasets oficiais (references.json.gz, mcc_risk.json, normalization.json)
└── test/                # k6 (smoke + avaliação)
```

Detalhes em [`AGENTS.md` §3](./AGENTS.md#3-estrutura-do-monorepo-intenção).

---

## Documentação do desafio

Todos os documentos oficiais ficam em `docs/`:

- [`docs/README.md`](./docs/README.md) — Visão geral do desafio.
- [`docs/API.md`](./docs/API.md) — Contrato de `GET /ready` e `POST /fraud-score`.
- [`docs/REGRAS_DE_DETECCAO.md`](./docs/REGRAS_DE_DETECCAO.md) — As **14 dimensões** do
  vetor + normalização + decisão.
- [`docs/BUSCA_VETORIAL.md`](./docs/BUSCA_VETORIAL.md) — Introdução didática a KNN/ANN.
- [`docs/DATASET.md`](./docs/DATASET.md) — `references.json.gz`, `mcc_risk.json`,
  `normalization.json`.
- [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md) — Restrições (LB + 2 instâncias, 1 CPU,
  350 MB total, porta 9999, `linux/amd64`, `bridge`).
- [`docs/AVALIACAO.md`](./docs/AVALIACAO.md) — Fórmula de pontuação (latência + detecção).
- [`docs/SUBMISSAO.md`](./docs/SUBMISSAO.md) — Branch `submission`, `info.json`,
  abertura de issue `rinha/test`.
- [`docs/FAQ.md`](./docs/FAQ.md) — Dúvidas recorrentes.

---

## Documentação para agentes

- **[`AGENTS.md`](./AGENTS.md)** — A "spec que evolui". Visão, stack, estrutura,
  arquitetura, regras de TDD/JSDoc, env vars, hurdles, DoD, inventário de componentes.
  **Leia isso antes de qualquer mudança.**
- **[`CLAUDE.md`](./CLAUDE.md)** — Apontador para `AGENTS.md` (mesmo conteúdo).

---

## Roadmap

1. **Fase 1 — Boilerplate Nx + DDD/Hexagonal.** *(em andamento)*
2. **Fase 2 — Infra (`docker-compose` + nginx LB + 2 réplicas) + endpoints stub.**
3. **Fase 3 — CI/CD (GitHub Actions: lint + typecheck + test + build + smoke k6).**
4. **Fase 4 — Camadas de harness para o agente + integração com
   [Archon](https://github.com/coleam00/archon).**
5. **Fase 5 — Implementações reais comparadas:** brute-force baseline → KD-tree →
   VP-tree → HNSW; tuning de infra, pré-processamento de dataset, benchmarks.

---

## Licença

[MIT](./LICENSE).
