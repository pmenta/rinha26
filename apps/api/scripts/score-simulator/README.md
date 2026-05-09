# `score-simulator` — substituto leve do `k6 run test/test.js`

Camada **L12** do harness (`AGENTS.md` §12.2). Roda `test/test-data.json`
(54.100 entries rotuladas) contra a API local e calcula o `final_score`
seguindo a mesma fórmula do `test/test.js` oficial (`docs/AVALIACAO.md`).

**Por que existir?** Feedback rápido durante desenvolvimento. O `k6 run`
oficial precisa de docker compose + ramp-up + workers, e demora ~2 min só
para começar. O simulator vai direto via `fetch` no Bun: roda tudo em ~10-30s
(dependendo da concorrência e da impl do `VectorIndexPort`).

## Como rodar

```bash
# Suba a API primeiro (qualquer um dos dois caminhos):
docker compose up --build           # estilo "submission"
# OU
cd apps/api && PORT=9999 \
  REFERENCES_PATH=../../resources/example-references.json \
  bun run --smol src/main.ts        # estilo "dev"

# Em outro terminal — rodar o simulator:
bun apps/api/scripts/score-simulator/run.ts
bun apps/api/scripts/score-simulator/run.ts --limit 1000          # subset
bun apps/api/scripts/score-simulator/run.ts --concurrency 100
bun apps/api/scripts/score-simulator/run.ts --base http://localhost:8080

# Via Nx (mesma coisa, com cache disabled):
bunx nx run api:simulate
```

## Output

Pretty print no stdout (cópiavel pra issue/PR):

```
final_score = 1234.56
  p99_score    = 1500.00          (p99 = 31.62 ms)
  detection    = -265.44
  breakdown    = TP=23456 TN=29200 FP=850 FN=400 Err=194
  failure_rate = 2.67%   (E=2820, ε=0.052)
  elapsed      = 18.42 s   (2937.10 rps)

saved → apps/api/test-output/simulator-results.json
```

JSON estruturado em `apps/api/test-output/simulator-results.json` —
**mesmo schema** do `test/results.json` produzido pelo k6, mais um bloco
`meta` com info do run.

## Limitações conhecidas

- **Não simula a curva de carga do k6** (`ramping-arrival-rate` em
  `test/test.js`). O simulator usa pool de concorrência fixo — bom para
  iteração, ruim para reprodutibilidade do score oficial.
- **Não substitui o k6 oficial** para a submissão. O score deste simulator
  é uma **boa estimativa direcional**, não o que a Engine vai medir.
- Latência inclui round-trip pelo `localhost` — abaixo do que o `k6`
  reporta (que mede dentro do mesmo runner).

## Quando usar k6 ao invés

- Validação final antes de submeter (`k6 run test/test.js`).
- CI smoke (`k6 run test/smoke.js` — já na pipeline).
- Profiling de pico de carga.

## Quando usar o simulator ao invés

- Iteração rápida (mexer numa impl, ver impacto no `final_score`).
- Comparar 2 impls lado a lado (rodar para cada e diff dos JSONs).
- TDD da própria fórmula (specs em `scoring.spec.ts` cobrem 8 casos
  golden de `docs/AVALIACAO.md`).
