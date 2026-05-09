# `bench/` — harness de benchmark do `@rinha26/vector-store`

Camada **L11** do harness (`AGENTS.md` §12.2). Mede `build_ms` e estatísticas
de latência de query (`avg`, `p50`, `p95`, `p99`, `max`) para cada combinação
`kind × dataset_size`, e estima `heap_after_build_bytes`.

## Como rodar

```bash
# Direto via Bun:
bun packages/vector-store/bench/run-bench.ts

# Via Nx target (mesma coisa, com cache):
bunx nx run vector-store:bench
```

Saída (exemplo):

```
# Bench results — 2026-05-09T19:40:00.000Z
Runtime: bun=1.1.29 node=v22.22.0 darwin/arm64

| kind | N | build_ms | q.avg | q.p50 | q.p95 | q.p99 | q.max | heap |
|------|---:|---:|---:|---:|---:|---:|---:|---:|
| brute-force | 100   | 0.04 | 0.012 | 0.011 | 0.020 | 0.025 | 0.034 | 12.4 MB |
| brute-force | 1000  | 0.21 | 0.083 | 0.080 | 0.110 | 0.140 | 0.180 | 13.2 MB |
| brute-force | 10000 | 1.84 | 0.640 | 0.620 | 0.890 | 1.110 | 1.300 | 16.8 MB |

saved → packages/vector-store/bench-results/2026-05-09T19-40-00-000Z.json
latest → packages/vector-store/bench-results/latest.json
```

## Output

- **JSON estruturado** em `packages/vector-store/bench-results/<timestamp>.json`
  (commit-friendly diff entre runs). Schema em `measure.ts → BenchSnapshot`.
- **Symlink** `latest.json` → último run. Vai facilitar a camada **L14**
  futura (bench guard no CI: comparar `latest.json` da PR com o de `main` e
  falhar se houver regressão > 5%).

## Como adicionar uma nova impl

1. Adicione o `kind` em `run-bench.ts → targets`.
2. Rode `bun packages/vector-store/bench/run-bench.ts`.
3. Commit do JSON gerado junto com a impl.

## Notas

- **Determinismo**: queries e dataset usam o LCG Park-Miller de
  `__contracts__/synthetic-dataset.ts`. Reproduzível bit-a-bit entre runs
  (a menos da variância de wall-clock).
- **Não é adversarial**: o bench mede o **happy path** (queries
  determinísticas no espaço médio). Casos pathológicos (ex.: ANN com query
  exatamente na fronteira de cluster) entram nos contracts test.
- **Memória é aproximação**: `process.memoryUsage().heapUsed` reflete o
  **runtime inteiro**, não só o índice. Use diff entre `dataset_size`s
  para estimar custo marginal por vetor.
