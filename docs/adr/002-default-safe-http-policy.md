# ADR-002 — Política HTTP `default-safe` no `/fraud-score`

| Campo         | Valor                                              |
|---------------|----------------------------------------------------|
| **Status**    | `accepted`                                         |
| **Decisores** | Spicy (humano + agente Claude Sonnet 4.x)         |
| **Data**      | 2026-05-09                                         |
| **Tags**      | `arquitetura`, `política`, `scoring`               |

## Contexto

`docs/AVALIACAO.md` define a fórmula de pontuação da Rinha. Em particular:

- O `score_det` usa **erros ponderados** `E = 1·FP + 3·FN + 5·Err` e a
  **taxa de falhas** `(FP + FN + Err) / N`.
- HTTP 5xx/4xx (`Err`) tem peso **5×** — maior que `FN` (3) que é maior que
  `FP` (1).
- Se `(FP + FN + Err) / N > 15%`, o `score_det` é **fixado em −3000**
  (corte rígido — anula qualquer ganho de p99).
- Cada `Err` também conta para o p99 com timeout de `2001ms` (`test/test.js`).

A leitura óbvia: **um erro HTTP é o pior cenário possível** — pesa 5× na
fórmula ponderada e ainda contribui para o corte.

A pergunta: o que fazer quando o backend não consegue calcular a resposta
(payload inválido, índice ainda não carregou, falha do `VectorIndexPort`)?

## Decisão

Em **qualquer falha** dentro do handler de `POST /fraud-score`, responder com:

```json
HTTP 200
{ "approved": true, "fraud_score": 0 }
```

Casos cobertos:
1. Body falha no parse Zod (`ScoreTransactionInputSchema.safeParse(body)` → !success).
2. Body cai no schema TypeBox da Elysia (validação na borda) — mesma resposta.
3. `useCase.execute(...)` retorna `IResult.fail` (`NoNeighborsFound`,
   `VectorIndexError`, etc.) — mesma resposta.
4. Exceção não-prevista no handler — Elysia normalmente retornaria 500;
   convém capturar e devolver 200 default-safe (ainda a fazer com `onError`).

A constante `DEFAULT_SAFE_RESPONSE` está em `apps/api/src/routes/fraud-score.ts`.

## Alternativas consideradas

- **422 / 400 nos casos 1 e 2 (validação) + 500 nos casos 3 e 4** — semântica
  HTTP correta. *Rejeitada* porque cada `Err` tem peso `5` na fórmula
  ponderada e conta na `failure_rate`. Trocar `Err` por `FN` (peso 3)
  reduz `E` por requisição e remove a contribuição para o corte de 15%.
- **`{approved: false, fraud_score: 1}` (default "negar")** — mais
  conservador (priorizar segurança do cartão). *Rejeitada* porque negar
  uma transação legítima é `FP` (peso 1), e como em produção o tráfego é
  majoritariamente legítimo, o custo esperado é maior que `{approved: true}`
  (que potencialmente vira `FN`, peso 3, mas só nas que de fato eram fraude).
  Como no teste oficial a distribuição esperada não é 50/50 (ver
  `test-data.json` stats), default `approved: true` minimiza erro esperado.
- **Mix: 200 nos casos 1/2 (validação) e 500 nos casos 3/4 (infra)** —
  semântica de validação correta. *Rejeitada* porque `500` ainda custa 5
  enquanto `200 default-safe` custa entre 1 (FP) e 3 (FN). Mesmo trade-off
  que a alternativa anterior.

## Consequências

### Positivas

- Zero `Err` na avaliação (modulo bugs reais — exceções não-capturadas).
- Mantém a `failure_rate` longe do corte de 15%.
- Resposta sempre rápida (default constante, sem chamada ao índice).

### Negativas / trade-offs

- **Esconde bugs reais**. Se algo quebrar dentro do handler, o usuário recebe
  uma resposta plausível e nada mostra que algo deu errado. Mitigação:
  logs estruturados (a fazer) e métricas (a fazer).
- **Não é HTTP-semantically correct**. APIs em outros contextos (não-Rinha)
  jamais deveriam fazer isso — viola REST e dificulta debugging para clientes.
- Pode mascarar regressões em CI se os testes só checam status code.
  Mitigação: testes que validam **payload exato** retornado (já fazemos em
  `fraud-score.spec.ts`).

### Riscos

- Se a Rinha mudar a fórmula de pontuação (peso de `Err` ↓ ou peso de `FN` ↑),
  esta política deixa de fazer sentido — revisitar.
- Se o p99 estiver folgado (ex.: < 5ms), o ganho marginal de evitar `Err` pode
  não compensar a perda de visibilidade — revisitar.

## Implementação

- `apps/api/src/routes/fraud-score.ts` — `DEFAULT_SAFE_RESPONSE` + handler que
  cai nele em qualquer falha.
- `apps/api/src/routes/fraud-score.spec.ts` — 3 testes cobrem: PRD-fraud
  classifica corretamente; payload inválido → default-safe; índice vazio
  (use case retorna fail) → default-safe.
- `apps/api/src/routes/fraud-score.ts` `@fileoverview` documenta a justificativa.

## Como revisitar

- Quando o p99 baseline ficar < 5ms (já bem dentro do `score_p99` máximo),
  considerar substituir `200 default-safe` por `422` em validação (caso 1/2)
  para recuperar visibilidade — desde que isso não dispare o corte de 15%.
- Antes do teste final oficial, revalidar com a fórmula vigente em
  `docs/AVALIACAO.md` (pesos podem ter sido revisados).
