# `@rinha26` — Agente onboarding (spec que evolui)

Este documento é **vivo**: ele evolui junto com o código. Toda vez que você (humano ou
agente) descobrir um *hurdle*, tomar uma decisão arquitetural, criar uma nova env var,
formalizar um padrão repetido ou se cansar de explicar a mesma pegadinha,
**atualize este arquivo** — para que a próxima sessão já comece *onboarded*.

> Inspiração de processo: ["Do Zero à Pós-Produção em 1 Semana", Akita, 2026][akita-post]
> — pair programming com agente de IA, XP (TDD + small releases + refactor contínuo + CI),
> e o `CLAUDE.md`/`AGENTS.md` como **a spec que evolui**.

> Inspiração de estrutura: o monorepo `payrouter` (`/Users/pimenta/www/payrouter`) — DDD +
> hexagonal + NX + ports/adapters espelhados + testes de domínio com fakes.

> Filosofia: agentes são pair programmers. **O humano decide o quê. O agente decide o como.**
> Disciplina (TDD/CI/refactor/documentação) é o que separa um produto real de uma demo.

> **Fontes da verdade** (em caso de dúvida, mandam):
>
> - **Desafio:** `docs/README.md` + `docs/API.md` + `docs/REGRAS_DE_DETECCAO.md` +
>   `docs/DATASET.md` + `docs/AVALIACAO.md` + `docs/ARQUITETURA.md` +
>   `docs/SUBMISSAO.md` + `docs/FAQ.md` + `docs/BUSCA_VETORIAL.md`.
> - **Avaliação:** `test/test.js` (k6 oficial), `test/smoke.js`, `test/test-data.json`.
> - **Recursos do desafio:** `resources/references.json.gz` (3M vetores rotulados),
>   `resources/mcc_risk.json`, `resources/normalization.json`,
>   `resources/example-payloads.json`, `resources/example-references.json`.

---

## 1) Visão do desafio (resumo)

Construir uma API HTTP que decide se cada transação de cartão é fraude, expondo:

- `GET /ready` — `2xx` quando estiver pronta para receber tráfego.
- `POST /fraud-score` — recebe payload de transação, devolve `{ approved, fraud_score }`.

A decisão é uma **busca vetorial KNN (k=5)** sobre 3.000.000 vetores de **14 dimensões**
rotulados como `fraud` ou `legit`. `fraud_score = fraudes_entre_os_5 / 5`. `approved = score < 0.6`.

Restrições oficiais (`docs/ARQUITETURA.md`):

- Porta exposta: **9999**.
- **Load balancer + ≥ 2 instâncias** da API (round-robin), LB sem lógica de negócio.
- Soma de limites: **≤ 1 CPU e 350 MB de memória** total (todos os serviços do compose).
- Imagens públicas, **`linux/amd64`**, modo `bridge`, sem `host`/`privileged`.
- Pontuação: latência (p99 com log até +3000) + detecção (FP/FN/Err ponderados, corte se
  taxa de falhas > 15%). Cada componente vai de −3000 a +3000; total: [−6000, +6000].

---

## 2) Stack & workspace

- **Monorepo:** [Nx](https://nx.dev) `22.6.x`.
- **Package manager:** [Bun](https://bun.sh) `≥ 1.1.29` (`bun install`, `bun.lock`).
- **Runtime API (hot path):** Bun (`bun run src/main.ts`) — runtime principal do desafio.
- **Linguagem:** TypeScript (ESM, strict, `nodenext`).
- **Test runner:** [Vitest](https://vitest.dev) `^3.2` via plugin oficial `@nx/vitest`
  (decisão: maior maturidade no Nx, coverage v8 e workspace mode; `bun test` foi
  descartado por falta de plugin Nx).
- **Validação de schema:** [Zod](https://zod.dev) `^4`.
- **Result/Either:** [`typescript-monads`](https://www.npmjs.com/package/typescript-monads)
  (`IResult<T, E>`).
- **HTTP framework:** [Elysia.js](https://elysiajs.com) (Bun-native; mesmo do payrouter).
- **Lint:** ESLint (flat config) + `@nx/eslint-plugin` com `enforce-module-boundaries`.
- **Format:** Prettier (`singleQuote: true`).
- **Container:** Docker (multi-stage Bun, `linux/amd64`).
- **Load balancer:** nginx (round-robin nas réplicas).
- **Carga / avaliação:** k6 (`test/smoke.js`, `test/test.js`).
- **Arquitetura:** **DDD + Hexagonal + SOLID**, ports/adapters espelhados.
- **Metodologia:** **TDD** (testes como rede de segurança para a IA refatorar com
  confiança).

### Navegação & automação com Nx (obrigatório para agentes)

Antes de "alucinar" comandos de build/test, sempre confirme o grafo do projeto:

- `bunx nx show projects` — lista de projetos por nome curto.
- `bunx nx graph` — grafo visual completo do workspace.
- `bunx nx show project <name>` — targets disponíveis para um projeto específico.
- `bunx nx run <project>:<target>` ou `bunx nx run-many -t <target>` para múltiplos.
- `bunx nx affected -t lint test typecheck build` — só o que mudou desde `main`.

Atalhos via scripts do `package.json` raiz:

- `bun run graph`, `bun run lint`, `bun run test`, `bun run typecheck`, `bun run build`,
  `bun run verify` (lint + typecheck + test + build em sequência).

### PRs no GitHub (`gh` — obrigatório)

- **Ferramenta:** `gh pr create`, `gh pr edit`, `gh pr ready`, `gh pr view` (não depender só da UI).
- **Template do corpo do PR:**

```markdown
## Resumo
(1 parágrafo: o quê, qual fase/issue, ficheiros-chave se útil.)

## Commits
- `mensagem commit 1`
- `mensagem commit 2`

## Verificação
- `bun run verify` (ou `bunx nx affected -t ...`) passa localmente.
- (Quando houver) `docker compose up --build` + `k6 run test/smoke.js` passam.
```

- **Workflow:**
  1. Ao iniciar uma issue/feature, abra **draft PR** logo cedo (commit vazio se
     necessário): `gh pr create --draft --base main`.
  2. Mantenha o PR atualizado — descrição, commits, verificação.
  3. Ao concluir o DoD (§13), `gh pr ready` e atualize o corpo final.

---

## 3) Estrutura do monorepo (intenção)

> Se a estrutura real divergir, **atualize esta seção** no mesmo PR.

```
rinha-26/
├── AGENTS.md                       # Este doc (spec viva).
├── CLAUDE.md                       # Apontador para AGENTS.md (mesmo conteúdo).
├── README.md                       # Visão executiva + como rodar.
├── LICENSE                         # MIT (exigido pela Rinha).
├── info.json                       # Metadados de submissão (docs/SUBMISSAO.md).
│
├── nx.json
├── package.json                    # workspaces: packages/*, apps/*
├── tsconfig.base.json              # strict + customConditions @rinha26/source
├── tsconfig.json                   # references por projeto
├── eslint.config.mjs               # flat + module boundaries por scope:*
├── vitest.workspace.ts             # workspace de testes
├── bunfig.toml
│
├── docs/                           # Documentação OFICIAL do desafio (não tocar).
├── resources/                      # Datasets oficiais (não tocar).
├── test/                           # Scripts k6 oficiais (não tocar).
│
├── packages/
│   ├── core/                       # Domínio + aplicação + ports + fakes.
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── entities/       # FraudTransaction, ReferenceVector, ScoreResult.
│   │   │   │   ├── value-objects/  # FeatureVector (14d), MccRisk, Normalization.
│   │   │   │   ├── errors/         # *.errors.ts por bounded context.
│   │   │   │   └── policies/       # vectorize.ts (regras de detecção §1-§14).
│   │   │   ├── application/
│   │   │   │   └── score-transaction/   # ScoreTransactionUseCase + spec.
│   │   │   ├── ports/
│   │   │   │   ├── repositories/   # ReferenceRepositoryPort.
│   │   │   │   └── services/       # VectorIndexPort, McccRiskPort, NormalizationPort, ClockPort.
│   │   │   └── adapters/
│   │   │       ├── repositories/   # InMemoryReferenceRepository (fake p/ testes).
│   │   │       └── services/       # BruteForceVectorIndex (baseline), FakeMccRiskTable.
│   │   └── package.json            # tag: scope:core
│   │
│   └── vector-store/               # Implementações REAIS de VectorIndexPort.
│       ├── src/
│       │   ├── brute-force/        # baseline produtivo (otimizado).
│       │   ├── kd-tree/            # (futuro)
│       │   ├── vp-tree/            # (futuro — busca exata sub-linear).
│       │   ├── hnsw/               # (futuro — ANN, O(log N)).
│       │   └── index.ts            # barrel.
│       └── package.json            # tag: scope:vector-store
│
└── apps/
    └── api/                        # Inbound HTTP (Bun + Elysia).
        ├── src/
        │   ├── main.ts             # bootstrap (env + container + listen :9999).
        │   ├── container.ts        # wiring real (vector-store + repos).
        │   ├── routes/
        │   │   ├── ready.ts        # GET /ready
        │   │   └── fraud-score.ts  # POST /fraud-score
        │   ├── plugins/            # Elysia plugins compartilhados.
        │   └── lib/                # error-mapper.ts, etc.
        ├── Dockerfile              # (Fase 2)
        └── package.json            # tag: scope:api
```

### Design pattern: espelhamento ports → adapters

Adapters espelham ports no primeiro nível (`repositories/`, `services/`). Repositórios
são agrupados por agregado/domínio; services são "flat" porque costumam ser cross-cutting.

```
ports/repositories/reference-repository.port.ts
  → packages/core/adapters/repositories/in-memory-reference-repository.ts  (fake p/ testes)

ports/services/vector-index.port.ts
  → packages/core/adapters/services/brute-force-vector-index.ts             (baseline em-memória)
  → packages/vector-store/src/brute-force/...                                (impl. produtiva)
  → packages/vector-store/src/kd-tree/...                                    (futuro)
```

### Padrão de rota na API (controller + service + factory)

Cada rota é uma **factory** que recebe seus services e devolve uma `Elysia` instance.
Validação de body via **Zod** (Standard Schema do Elysia). Erros de domínio (`IResult.fail`)
são mapeados para HTTP via `lib/error-mapper.ts`.

### Regra: domínio não depende de framework

`packages/core` **nunca** importa Elysia/Bun/Fetch/Drivers. Validação na borda; use cases
recebem input já tipado (saiu do Zod).

### Documentação OpenAPI (a ser ligada na Fase 2)

Sempre que criar/alterar uma rota HTTP, preencher `detail` (`summary`, `description`,
`tags`) e `response` schemas — o plugin OpenAPI publica automaticamente.

---

## 4) Domínio do desafio (linguagem ubíqua)

- **Transação (`FraudTransaction`)** — payload de entrada (`docs/API.md`): `id`,
  `transaction.{amount,installments,requested_at}`, `customer.{avg_amount,tx_count_24h,known_merchants}`,
  `merchant.{id,mcc,avg_amount}`, `terminal.{is_online,card_present,km_from_home}`,
  `last_transaction: { timestamp, km_from_current } | null`.
- **Vetor de característica (`FeatureVector`, 14d)** — saída da vetorização:
  `[amount, installments, amount_vs_avg, hour_of_day, day_of_week,
    minutes_since_last_tx, km_from_last_tx, km_from_home,
    tx_count_24h, is_online, card_present, unknown_merchant,
    mcc_risk, merchant_avg_amount]`.
  Todos em `[0.0, 1.0]`, com a única exceção dos índices `5` e `6` que
  recebem **`-1` sentinela** quando `last_transaction === null` (`docs/REGRAS_DE_DETECCAO.md`).
- **Vetor de referência (`ReferenceVector`)** — `{ vector: number[14], label: 'fraud' | 'legit' }`,
  carregado de `resources/references.json.gz` (3M registros, ~284 MB descomprimido,
  ~16 MB gzipado).
- **Score de fraude (`fraud_score`)** — número em `[0.0, 1.0]`: `n_fraudes_top5 / 5`.
- **Decisão** — `approved = fraud_score < 0.6` (threshold fixo).
- **MCC risk** — `resources/mcc_risk.json` mapeia `mcc → [0,1]`. **Default 0.5** quando
  ausente.
- **Constantes de normalização** — `resources/normalization.json` (`max_amount`,
  `max_installments`, `amount_vs_avg_ratio`, `max_minutes`, `max_km`, `max_tx_count_24h`,
  `max_merchant_avg_amount`).

### Bounded contexts (iniciais)

- **Detecção** (`packages/core/src/domain/policies/vectorize.ts`,
  `application/score-transaction/`) — vetorização + KNN + decisão.
- **Referências** (`ports/repositories/reference-repository.port.ts`) —
  carregamento e indexação dos 3M vetores.
- **Configuração** (`ports/services/normalization.port.ts`,
  `ports/services/mcc-risk.port.ts`) — leitura das constantes do dataset.

---

## 5) Arquitetura hexagonal (como desenhar código)

### Ports (interfaces — contrato com o mundo externo)

- `ReferenceRepositoryPort` — carregar/streamar os 3M vetores rotulados.
- `VectorIndexPort` — `query(vector: number[14], k: number) → ReferenceVector[]`.
  Implementações: brute-force (baseline), KD-tree, VP-tree, HNSW (futuro).
- `NormalizationConfigPort` — devolve `Normalization` (constantes do dataset).
- `McccRiskPort` — devolve risco por MCC com fallback `0.5`.
- `ClockPort` — `now(): Date` (parâmetros como `requested_at`/`last_tx.timestamp`
  vêm do payload, mas o clock fica disponível para uso futuro).

### Adapters

- HTTP adapter (Elysia, em `apps/api`) → mapeia DTO → use case → resposta.
- Adapters fakes em `packages/core/src/adapters/` para testes unitários.
- Adapters reais de busca vetorial em `packages/vector-store/`.

### Regra de dependência

- `domain` depende de **nada**.
- `application` depende de `domain` + `ports`.
- `adapters` dependem de `application` + frameworks/libs.
- `apps/api` faz o wiring real (injeta adapters reais nos use cases).

### Regra de Result: toda função que pode falhar retorna `IResult<T, E>`

- **Ports** retornam `IResult` com erros de infraestrutura.
- **Use cases** retornam `IResult` com union de erros de domínio + infraestrutura.
- **Erros de domínio** (ex.: `InvalidFraudPayload`) ficam em
  `domain/errors/{contexto}.errors.ts`.
- Todos os erros usam discriminated union via `_tag`.
- **Exceção:** funções síncronas sem I/O que não podem falhar
  (ex.: `clamp(x)`) retornam valor direto.
- Lib: `typescript-monads` — `ok()`, `fail()`, `IResult<T, E>`.

---

## 6) Padrão de Use Case (template)

Todo Use Case:

- **Input DTO** definido como schema Zod (`z.object(...)`) e tipo inferido via
  `z.infer<typeof Schema>`. O schema é exportado para que adapters validem na borda.
- Retorna `IResult<T, E>` explícito com erros tipados (nunca string solta).
- Não faz I/O direto: usa ports.
- Mantém lógica "sem efeito colateral" o máximo possível.

Checklist:

- [ ] Input é um schema Zod exportado (`export const XInputSchema = z.object(...)`).
- [ ] Teste unitário cobrindo happy path + ≥ 1 edge case relevante.
- [ ] Erro(s) de domínio tipado(s).
- [ ] Idempotência quando aplicável.
- [ ] Logs/telemetria ficam na borda (API), não no domínio.

---

## 7) TDD: estratégia de testes

> Os testes são a principal rede de segurança para a IA refatorar com confiança.
> ([Akita, 2026][akita-post])

- **Domínio**: testes unitários intensivos (entities/policies/invariants). Em particular,
  a **vetorização** (14 dimensões) é coberta por **golden fixtures** baseadas nos
  exemplos oficiais (`docs/REGRAS_DE_DETECCAO.md` §1 e §6, `docs/BUSCA_VETORIAL.md`).
- **Use cases**: unit com fakes/mocks de ports.
- **Adapters**:
  - HTTP: testes de contrato (request/response, status codes).
  - Vector index: testes de equivalência (toda implementação deve produzir o mesmo top-K
    do brute-force para um dataset pequeno determinístico).
- **Integração / smoke**: `k6 run test/smoke.js` contra o `docker-compose` (Fase 2+).
- **Carga** (avaliação oficial): `k6 run test/test.js` — `test-data.json` tem ~5000
  payloads rotulados. **Proibido** usar isso como lookup (`docs/README.md`).

### Comandos rápidos

```bash
bunx nx test core                # só @rinha26/core
bunx nx test core --watch        # TDD loop
bunx nx affected -t test         # só o que mudou desde main
bun run verify                   # lint + typecheck + test + build (gate de CI local)
```

---

## 8) Regras de código (SOLID + boring code)

- Preferir código simples e explícito (evitar cleverness).
- Arquivos pequenos; extrair responsabilidade cedo.
- Validação na borda: adapters validam, use cases assumem input coerente.
- Mapear estado externo → estado canônico (não vazar formato do dataset pelo domínio).

### JSDoc (obrigatório)

- **Idioma**: português (BR), exceto nomes de API/códigos já fixos em inglês.
- **Obrigatório para todo símbolo exportado** em `packages/core`,
  `packages/vector-store` e `apps/api`: tipos/interfaces, classes, funções nomeadas,
  schemas Zod exportados como constantes, factories de erro e barrels (`index.ts` com
  `@fileoverview`).
- **Conteúdo**: propósito no negócio ou no contrato técnico; `@param`/`@returns` quando
  o tipo sozinho não documenta invariantes.
- **`@link`**: usar para apontar ports/use cases relacionados.
- **Evitar** JSDoc que só repete o nome do identificador; **atualizar** doc ao mudar
  comportamento ou contrato.
- **Testes** (`*.spec.ts`): não obrigatório por `it`; opcional `@fileoverview`.

---

## 9) Recursos do desafio (`resources/`)

| Arquivo | Tamanho | Uso |
|---|---|---|
| `references.json.gz` | ~16 MB gz / ~284 MB json | 3M vetores rotulados — input do `VectorIndexPort` |
| `mcc_risk.json` | <1 KB | tabela MCC → risco `[0,1]` (default `0.5`) |
| `normalization.json` | <1 KB | constantes de normalização das 14 dimensões |
| `example-references.json` | ~1.9 K linhas | recorte para inspeção rápida |
| `example-payloads.json` | ~1.5 K linhas | exemplos realistas do `POST /fraud-score` |

**Pré-processamento permitido** no build/startup do container — quanto mais sair do hot
path, melhor o p99 (`docs/AVALIACAO.md` §Estratégias).

---

## 10) Env vars

> A API roda em containers; sem AWS Secrets/SSM. Configuração vai por env var direto no
> `docker-compose.yml`.

### Comuns

- `NODE_ENV` — `development` | `production`. Default `development`.
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`. Default `info`.
- `PORT` — porta interna da API. Default `3000` (LB exposes `9999`).

### Dataset

- `REFERENCES_PATH` — caminho para o arquivo `references.json.gz` montado no container.
  Default `/app/resources/references.json.gz`.
- `MCC_RISK_PATH` — default `/app/resources/mcc_risk.json`.
- `NORMALIZATION_PATH` — default `/app/resources/normalization.json`.

### Algoritmo

- `VECTOR_INDEX_KIND` — `brute-force` | `kd-tree` | `vp-tree` | `hnsw`. Default
  `brute-force` (baseline). Permite trocar implementação sem rebuild.
- `KNN_K` — k do KNN. Default `5` (regra fixa).
- `FRAUD_THRESHOLD` — limiar de aprovação. Default `0.6` (regra fixa).

> **Atenção:** `KNN_K` e `FRAUD_THRESHOLD` são valores **da regra do desafio**. Mudá-los
> só faz sentido em testes/experimentos locais — para a submissão, ficar nos defaults.

---

## 11) Common Hurdles (preencher ao longo do projeto)

> Sempre que algo "te travar" ou for uma pegadinha recorrente, documente aqui.

1. **`customConditions` do TS NÃO é respeitado fora do `tsc`.** O `tsconfig.base.json`
   tem `customConditions: ["@rinha26/source"]` para que `tsc` resolva imports entre
   pacotes para `src/index.ts` (em vez de `dist/index.js`). Isso funciona para o
   `tsc --build`, mas **Bun runtime** e **Vite/Vitest** ignoram essa flag por padrão.
   Resultado: o consumer (ex.: `apps/api`) tenta importar `@rinha26/core` e cai em
   `dist/index.js` que pode não existir ou estar desatualizado. **Workarounds em uso**:
   - Para `apps/api:test` (Vitest), o target tem `dependsOn: ["^build"]` (em
     `nx.json → targetDefaults`) — antes do test, o `core` é buildado e o `dist/`
     fica disponível.
   - Para Bun runtime, idem: o `Dockerfile` (Fase 2) deve buildar o `core` antes de
     rodar `bun src/main.ts`. Alternativa: configurar `bunfig.toml [run] conditions`
     ou adicionar `"bun": "./src/index.ts"` no `exports` field do `core`.
2. **Não anotar `: Elysia` no retorno de factories de rota.** Elysia depende de
   inferência paramétrica para preservar metadados (path, body, response). Anotar
   apaga tudo e quebra `.use(...)` com TS2322 ("Types of property 'onStart' are
   incompatible"). Sempre **não anotar** o retorno — deixar inferir.
3. **`tsconfig.spec.json` não pode referenciar `tsconfig.app.json` se o app não emite
   `dist/.d.ts` antes.** Causa cascata `TS6305 "Output file has not been built"`.
   **Solução**: o spec do app inclui `src/**/*.ts` direto (não usa `references` para
   o próprio app; só para os pacotes externos). Hurdle conhecido também no payrouter.
4. **`bun install` precisa de sandbox amplo no Cursor.** Por padrão o sandbox bloqueia.
   Quando rodar via shell tool, usar `required_permissions: ["all"]` (ou pelo menos
   `["full_network"]` + acesso a `~/.bun`).
5. **`@nx/vite:test` está deprecated em favor de `@nx/vitest:test`.** Não bloqueia,
   mas vai parar de funcionar no Nx 23. Migrar quando a v23 for lançada.
6. **Política HTTP do `POST /fraud-score`: `200` default-safe em qualquer falha.**
   Justificativa em `apps/api/src/routes/fraud-score.ts` (`@fileoverview`):
   `Err` (HTTP 5xx/4xx) custa **5×** na taxa ponderada de `docs/AVALIACAO.md` e ainda
   conta na taxa de falhas (corte em 15%). Trocar `Err` por possível `FN` (peso 3)
   é matematicamente vantajoso na fórmula. Reavaliar quando p99 estiver folgado.
7. **Não usar `oven/bun:*-alpine` no Dockerfile.** O Nx 22 e alguns nativos do
   monorepo não distribuem build `linux-*-musl` para todas as arquiteturas
   (especificamente `linux-arm64-musl` quebra). Use `oven/bun:1.1.29` (Debian)
   no `deps/build` e `oven/bun:1.1.29-slim` no `runtime` — ambos glibc.
8. **Não chamar `nx` dentro do container Docker.** Mesmo com a imagem certa,
   evitar — o native binding do Nx para a plataforma do container precisa ser
   resolvido no install dentro do próprio container, e isso atrita com lockfile.
   Solução: chamar `bun x tsc --build packages/*/tsconfig.build.json` direto
   no stage `build`, sem Nx wrapper.
9. **`bun install --frozen-lockfile` no Dockerfile resolve native bindings da
   plataforma host.** Como o `bun.lockb` é gerado no Mac (arm64-darwin) e o
   container roda em `linux/amd64`, `--frozen-lockfile` quebra. **Solução**:
   `bun install` puro no container (sem `--frozen-lockfile`). A reprodutibilidade
   fica garantida pelo `package.json` + range exato de versões do `@nx/*`.
10. **Bun + `--smol` reduz consumo de heap.** Útil dado o limite global de 350 MB.
    Já aplicado no `CMD` do `Dockerfile`.
11. **k6 dentro de Docker para testar `localhost:9999`**: usar `--network=host`
    (funciona no Linux nativo e no OrbStack/Mac que faz host-network virtual).
    `--add-host=localhost:host-gateway` **não funciona** porque o resolver Go do
    k6 ignora `/etc/hosts` para `localhost` e cai direto em `127.0.0.1`.
12. *(placeholder)* O dataset usa o sentinela `-1` nas posições 5 e 6 — **não
    filtrar nem substituir** ao indexar (`docs/DATASET.md`). Já tratado em
    `vectorize.ts` e `references.loader.ts`.
13. **MCC ausente em `mcc_risk.json` → `0.5`** (já em `vectorize.ts → DEFAULT_MCC_RISK`).
14. **Carregar `references.json.gz` (3M registros, ~284MB JSON) em runtime estoura
    160MB de RAM por réplica.** A Fase 2 usa `example-references.json` (subset
    pequeno) via `REFERENCES_PATH` no compose. **Pré-processamento binário
    (Float32Array de 14d + Uint8Array de label, mmap via `Bun.file().arrayBuffer()`)
    fica para a Fase 5** junto com a escolha de ANN.

---

## 12) Camadas de harness para o agente (Fase 4)

> Espaço reservado para mapearmos as "redes de segurança" antes de delegar tarefas para
> agentes em loop. Inclui (preencher):
>
> - Validação de payload com Zod no input do use case (sentinelas, ranges).
> - Golden fixtures: vetorização determinística para os exemplos do PRD do desafio.
> - Equivalência entre implementações de `VectorIndexPort` em dataset pequeno
>   determinístico (qualquer impl. deve devolver o mesmo top-K do brute-force).
> - `k6 run test/smoke.js` rápido contra `docker-compose` local.
> - Brakeman-like (auditoria de deps): `bun audit` ou similar.
> - Integração com [Archon](https://github.com/coleam00/archon)
>   (`.archon/workflows/idea-to-pr.yaml`, `plan-to-pr.yaml`, etc.).

---

## 13) Checklist pós-implementação (DoD estendido)

- [ ] `bun run verify` (`lint + typecheck + test + build`) passa.
- [ ] Sem dependência de framework dentro de `packages/core`.
- [ ] Erros são tipados e previsíveis (`IResult<T, E>` com `_tag`).
- [ ] Payloads/DTOs validados nos adapters.
- [ ] Exports novos/alterados com JSDoc conforme §8.
- [ ] Rotas HTTP novas/alteradas: `detail` + `response` + (futuro) `security`.
- [ ] Atualizou `AGENTS.md`/`CLAUDE.md` se houve nova regra/hurdle/decisão.
- [ ] (Fase 2+) `docker compose up --build` sobe e `k6 run test/smoke.js` passa.
- [ ] **PR:** abriu/atualizou com `gh` e o **template** (Resumo / Commits / Verificação).
- [ ] Mudança é pequena o bastante para reverter facilmente.

---

## 14) Como este doc deve evoluir

Este doc é a "spec que evolui": **não tente escrever tudo no dia 1**. A cada descoberta,
adicione a seção mínima (hurdle, padrão, env var, contrato). O objetivo é reduzir
contexto perdido entre sessões e manter o agente sempre alinhado.

---

## 15) Inventário de componentes (estado atual)

> Atualize esta seção quando criar/alterar entidades, ports, use cases, adapters ou rotas.

### `packages/core` — domínio

| Componente | Arquivo | Função |
|---|---|---|
| Entidade `FraudTransaction` | `domain/entities/fraud-transaction.ts` | Payload de `POST /fraud-score` (imutável). |
| Entidade `ReferenceVector` | `domain/entities/reference-vector.ts` | Vetor 14d rotulado (`fraud`/`legit`) do dataset. |
| Entidade `ScoreResult` | `domain/entities/score-result.ts` | `{ approved, fraud_score }`. |
| VO `FeatureVector` (14d) + `clamp01` | `domain/value-objects/feature-vector.ts` | Tupla `readonly [n×14]`, `FEATURE_VECTOR_LENGTH`, `NULL_LAST_TX_SENTINEL`. |
| VO `Normalization` + `NormalizationSchema` | `domain/value-objects/normalization.ts` | Constantes do `normalization.json` validadas via Zod. |
| Erros `FraudError` | `domain/errors/fraud.errors.ts` | `InvalidFraudPayload`, `NoNeighborsFound`. |
| Erros `InfrastructureError` | `domain/errors/infrastructure.errors.ts` | `RepositoryError`, `VectorIndexError`. |
| Policy `vectorize` | `domain/policies/vectorize.ts` | Aplica as 14 fórmulas de `docs/REGRAS_DE_DETECCAO.md`. Função pura. `DEFAULT_MCC_RISK = 0.5`. |
| Policy `decide` | `domain/policies/decide.ts` | KNN→score. `KNN_K=5`, `FRAUD_THRESHOLD=0.6`. |

### `packages/core` — aplicação (use cases)

| Componente | Arquivo | Função |
|---|---|---|
| `ScoreTransactionUseCase` | `application/score-transaction/score-transaction.use-case.ts` | `vectorize` → `vectorIndex.query(k=5)` → `decide`. Erros: `NoNeighborsFound`, `VectorIndexError`. |
| `ScoreTransactionInputSchema` | `application/score-transaction/score-transaction.input.ts` | Schema Zod do payload (= `docs/API.md`). |

### `packages/core` — ports

| Port | Arquivo | Adapter(s) |
|---|---|---|
| `ReferenceRepositoryPort` | `ports/repositories/reference-repository.port.ts` | `InMemoryReferenceRepository` (fake). Real (gzip stream) virá na Fase 2. |
| `VectorIndexPort` | `ports/services/vector-index.port.ts` | `BruteForceVectorIndex` (baseline). Outras em `@rinha26/vector-store`. |
| `McccRiskPort` | `ports/services/mcc-risk.port.ts` | `FakeMccRiskTable`. Carga real de `mcc_risk.json` virá na Fase 2. |
| `NormalizationConfigPort` | `ports/services/normalization.port.ts` | `StaticNormalizationConfig`. Carga real virá na Fase 2. |
| `ClockPort` | `ports/services/clock.port.ts` | `SystemClock`. |

### `packages/core` — adapters (fakes, baselines, fixtures)

| Adapter / Fixture | Arquivo |
|---|---|
| `InMemoryReferenceRepository` | `adapters/repositories/in-memory-reference-repository.ts` |
| `BruteForceVectorIndex` | `adapters/services/brute-force-vector-index.ts` |
| `FakeMccRiskTable` | `adapters/services/fake-mcc-risk.ts` |
| `StaticNormalizationConfig` | `adapters/services/static-normalization-config.ts` |
| `SystemClock` | `adapters/services/system-clock.ts` |
| `OFFICIAL_NORMALIZATION` | `__fixtures__/official-normalization.ts` (re-exportado pelo barrel para uso entre pacotes). |
| `OFFICIAL_MCC_RISK` | `__fixtures__/official-mcc-risk.ts` |

### `packages/core` — testes (49 testes, 4 specs)

| Spec | Cobertura |
|---|---|
| `domain/policies/vectorize.spec.ts` | Golden bit-a-bit dos 2 exemplos do PRD (legítimo §"Visão geral", fraudulento §"Exemplo fraudulento") + invariantes (clamp, MCC default, last_tx delta). 33 testes. |
| `domain/policies/decide.spec.ts` | KNN→score + threshold edge cases. 7 testes. |
| `adapters/services/brute-force-vector-index.spec.ts` | Top-K determinístico + rejeição de `k≤0`/vetor com tamanho ≠ 14. **Oráculo** para futuras impls. 5 testes. |
| `application/score-transaction/score-transaction.use-case.spec.ts` | Pipeline completo + falha `NoNeighborsFound`. 4 testes. |

### `packages/vector-store` — implementações reais

| Componente | Estado |
|---|---|
| `createVectorIndex(kind, refs)` | Fábrica única em `src/factory.ts`. Hoje só `'brute-force'` (re-exportado do core). `'kd-tree'`, `'vp-tree'`, `'hnsw'` lançam erro descritivo até a Fase 5. |

### `apps/api` — HTTP (Bun + Elysia)

| Componente | Arquivo | Notas |
|---|---|---|
| Bootstrap | `src/main.ts` | Lê `PORT` (default `3000`), monta container, expõe rotas. |
| Container/wiring | `src/container.ts` | Carrega `mcc_risk.json` + `normalization.json` no startup (bloqueante); `references` em **background** (lazy). Proxy de `VectorIndexPort` permite swap atrás dos lazy loads. Falha de `mcc_risk` cai para tabela vazia (warn). |
| Loader `readJsonWithZod` | `src/loaders/read-json-with-zod.ts` | Lê arquivo (com `.gz` transparente via `DecompressionStream('gzip')`), parse JSON, valida Zod. Devolve `IResult`. Usa `Bun.file` em runtime e `fs/promises + zlib` no Vitest/Node. |
| Loader normalização | `src/loaders/normalization.loader.ts` | Aplica `NormalizationSchema` do core. |
| Loader MCC | `src/loaders/mcc-risk.loader.ts` | `Record<string, number in [0,1]>`. |
| Loader referências | `src/loaders/references.loader.ts` | Array `{vector:number[14], label}`. Aceita sentinela `-1`. |
| `GET /ready` | `src/routes/ready.ts` | `200 {status:"ok"}` quando `refs.length > 0`; `503 {status:"loading"}` enquanto carrega. |
| `POST /fraud-score` | `src/routes/fraud-score.ts` | Valida via Zod (`ScoreTransactionInputSchema`); chama use case; **default-safe `200 {approved:true, fraud_score:0}` em qualquer falha** (ver hurdle §11.6). |

#### Testes do `apps/api` (10 testes, 3 specs)

| Spec | Cobertura |
|---|---|
| `routes/ready.spec.ts` | 200 quando ready / 503 quando loading. Usa `Elysia.handle(Request)` em-memória. 2 testes. |
| `routes/fraud-score.spec.ts` | Caso fraudulento do PRD com 5 fraud-vizinhos → score 1; payload inválido → default-safe; índice vazio → default-safe. 3 testes. |
| `loaders/loaders.spec.ts` | Lê e valida `normalization.json`, `mcc_risk.json`, `example-references.json` e o **`references.json.gz` real (3M vetores em ~6.7s no Vitest/Node)**. 5 testes. |

### Infra (Fase 2)

| Componente | Arquivo | Notas |
|---|---|---|
| Dockerfile multi-stage | `apps/api/Dockerfile` | `oven/bun:1.1.29` (deps/build) → `oven/bun:1.1.29-slim` (runtime). Tudo `linux/amd64`. Runtime usa `bun --smol`. Sem Nx no container — builda com `tsc -b` direto. |
| `.dockerignore` | `.dockerignore` | Exclui `.git`, `dist`, `node_modules`, `resources` (vai por bind mount), `docs`. |
| nginx LB | `nginx.conf` | Round-robin `api1:3000`/`api2:3000`. Worker único, 1024 conn. `proxy_buffering off`, keepalive upstream. Timeouts 1-2s coerentes com `2001ms` do k6. |
| docker-compose | `docker-compose.yml` | nginx (0.10cpu/30MB) + api1 + api2 (0.45cpu/160MB cada). Total **0.95cpu/350MB** (limite oficial). `bridge` net, `linux/amd64`, imagens públicas. Bind mount de `./resources`. |

**Smoke validado**: `docker compose up --build` + `k6 run test/smoke.js` →
**20/20 checks verdes**, p(95) = ~19ms com brute-force sobre 100 vetores
do `example-references.json`. Para rodar k6 contra `localhost:9999` via
container: `docker run --network=host grafana/k6:latest run /test/smoke.js`
(ver hurdle §11.11).

### Estado das fases

- ✅ **Fase 1** (boilerplate Nx + DDD/Hexagonal). 56 testes verdes. `bun run verify` passa.
- ✅ **Fase 2** (infra Docker). 61 testes verdes (49+2+10). Stack `docker compose up --build` sobe e k6 smoke passa 100%.
- ⏳ **Fase 3** (CI/CD GitHub Actions).
- ⏳ **Fase 4** (camadas de harness do agente + Archon).
- ⏳ **Fase 5** (implementações sub-lineares de `VectorIndexPort` + pré-processamento binário do `references.json.gz` 3M).

---

[akita-post]: https://akitaonrails.com/2026/02/20/do-zero-a-pos-producao-em-1-semana-como-usar-ia-em-projetos-de-verdade-bastidores-do-the-m-akita-chronicles/#o-claudemd-a-spec-que-evolui
