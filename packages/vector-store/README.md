# `@rinha26/vector-store`

Implementações reais (produtivas) do
[`VectorIndexPort`](../core/src/ports/services/vector-index.port.ts) do
`@rinha26/core` — busca KNN sobre vetores de 14 dimensões.

> **Por que pacote separado?** O `@rinha26/core` carrega apenas o **baseline
> brute-force** (em `core/src/adapters/services/brute-force-vector-index.ts`) que
> serve como oráculo de testes (qualquer impl. aqui deve produzir o mesmo top-K).
> As implementações sub-lineares (KD-tree, VP-tree, HNSW, IVF, LSH) ficam aqui
> para isolar dependências de build/runtime.

---

## Estrutura

```
src/
├── brute-force/    # Reexporta + variações otimizadas do baseline (typed arrays etc).
├── kd-tree/        # (placeholder) Busca exata sub-linear.
├── vp-tree/        # (placeholder) Busca exata por distância.
├── hnsw/           # (placeholder) ANN aproximado.
└── index.ts        # Barrel de fábrica: createVectorIndex(kind, refs).
```

---

## Adicionando uma nova implementação

1. Criar `src/<kind>/` com:
   - `index.ts` (barrel).
   - `<kind>-vector-index.ts` exportando classe `class XxxVectorIndex implements VectorIndexPort`.
   - `<kind>-vector-index.spec.ts` rodando o **set comum de testes de equivalência** (a ser
     extraído na Fase 5: input determinístico, comparar top-K com `BruteForceVectorIndex`).
2. Registrar em `src/index.ts → createVectorIndex(kind, refs)`.
3. Documentar no `AGENTS.md` §15 (Inventário de componentes).
4. (Fase 5) Adicionar bench em `apps/api/bench` ou no harness Archon.

---

## Estado atual (Fase 1)

- [x] Skeleton + tsconfigs + eslint + vitest.
- [x] Re-export do `BruteForceVectorIndex` do core via `createVectorIndex('brute-force', refs)`
      (para que `apps/api` possa fazer `import { createVectorIndex } from '@rinha26/vector-store'`).
- [ ] (Fase 5) Implementações `kd-tree`, `vp-tree`, `hnsw`.
- [ ] (Fase 5) Bench e set comum de testes de equivalência.
