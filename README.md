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

> **Pré-requisitos:** [Bun ≥ 1.1.29](https://bun.sh), Docker (com OrbStack ou Docker
> Desktop) e (opcional) [k6](https://k6.io) localmente.

### Desenvolvimento local (sem Docker)

```bash
bun install                 # instala dependências (Bun workspaces)
bun run verify              # lint + typecheck + test + build (gate completo)

# Comandos individuais
bun run lint
bun run typecheck
bun run test
bun run build
bun run graph               # abre Nx graph no navegador

# Subset por projeto
bunx nx test core
bunx nx affected -t test    # só o que mudou desde `main`

# Subir a API via Bun direto (sem Docker, na porta 9999)
cd apps/api
PORT=9999 \
  REFERENCES_PATH=../../resources/example-references.json \
  bun run --smol src/main.ts
```

### Stack completa (Docker — submissão oficial)

```bash
# Sobe nginx (LB) + 2 réplicas da API (porta 9999, total ≤ 1 CPU + 350 MB)
docker compose up --build

# Em outro terminal:
curl http://localhost:9999/ready
curl -X POST http://localhost:9999/fraud-score \
  -H 'content-type: application/json' \
  -d @<(jq '.[0]' resources/example-payloads.json)
```

### Smoke / avaliação (k6)

```bash
# Smoke local (5 reqs, valida formato)
k6 run test/smoke.js

# Avaliação oficial (~54k reqs, gera test/results.json)
k6 run test/test.js

# Sem k6 instalado? Use container (network=host funciona em Linux e OrbStack):
docker run --rm --network=host -v $(pwd)/test:/test grafana/k6:latest \
  run /test/smoke.js
```

### Harness do agente (L10/L11/L12)

```bash
# Bench do VectorIndexPort (Nx target):
bunx nx run vector-store:bench
# → tabela markdown no stdout + JSON em packages/vector-store/bench-results/

# Score simulator local (substituto leve do k6 oficial):
docker compose up -d                     # ou bun run dev
bunx nx run api:simulate                 # roda test-data.json contra :9999
bun apps/api/scripts/score-simulator/run.ts --limit 1000 --concurrency 50
# → final_score + breakdown + JSON em apps/api/test-output/
```

Ver [`packages/vector-store/bench/README.md`](./packages/vector-store/bench/README.md)
e [`apps/api/scripts/score-simulator/README.md`](./apps/api/scripts/score-simulator/README.md)
para detalhes.

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

## CI/CD (GitHub Actions)

3 workflows em [`.github/workflows/`](./.github/workflows/):

| Workflow | Trigger | Função |
|---|---|---|
| [`ci.yml`](./.github/workflows/ci.yml) | PR + push `main` | `verify` (lint + typecheck + test + build) e `docker-smoke` (compose + k6). |
| [`build-image.yml`](./.github/workflows/build-image.yml) | push `main`, tags `v*` | Builda e publica `ghcr.io/<owner>/rinha26-api:latest` (linux/amd64). |
| [`submission.yml`](./.github/workflows/submission.yml) | push `main` | Force-push da branch `submission` (só `docker-compose.yml` + `nginx.conf` + `info.json` + `resources/`, sem código-fonte; conforme [`docs/SUBMISSAO.md`](./docs/SUBMISSAO.md)). |

Detalhes em [`AGENTS.md` §"CI/CD (Fase 3)"](./AGENTS.md#cicd-fase-3).

## Decisões de arquitetura (ADRs)

Decisões não-triviais documentadas em [`docs/adr/`](./docs/adr/README.md):

- [ADR-001 — Stack inicial: Bun + Elysia + DDD/Hexagonal + Nx + Vitest](./docs/adr/001-stack-inicial.md)
- [ADR-002 — Política HTTP `default-safe` no `/fraud-score`](./docs/adr/002-default-safe-http-policy.md)
- [ADR-003 — `BruteForceVectorIndex` como oráculo de equivalência](./docs/adr/003-brute-force-como-oraculo.md)

Mapeamento completo das camadas de harness (taxonomia de tarefas, 18 camadas
L1-L18, DoR por categoria, gates de auto-merge, plano Archon) em
[`AGENTS.md` §"12) Camadas de harness para o agente (Fase 4)"](./AGENTS.md#12-camadas-de-harness-para-o-agente-fase-4).

## Roadmap

1. ✅ **Fase 1 — Boilerplate Nx + DDD/Hexagonal.**
2. ✅ **Fase 2 — Infra (`docker-compose` + nginx LB + 2 réplicas) + endpoints reais.**
3. ✅ **Fase 3 — CI/CD GitHub Actions.**
4. ✅ **Fase 4 — Mapeamento das camadas de harness** (taxonomia de tarefas, DoR
   por categoria, ADRs, plano Archon).
5. ✅ **Fase 4.5 — Pré-requisitos materiais da Fase 5:** contracts test entre
   `VectorIndexPort` impls (L10), bench harness (L11) e score simulator local (L12).
6. ⏳ **Fase 5 — Implementações reais comparadas:** brute-force baseline → KD-tree →
   VP-tree → HNSW; pré-processamento binário do dataset 3M; tuning de infra; benchmarks.

---

## Licença

[MIT](./LICENSE).
