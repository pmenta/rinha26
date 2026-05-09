# ADR-003 — `BruteForceVectorIndex` como oráculo de equivalência

| Campo         | Valor                                              |
|---------------|----------------------------------------------------|
| **Status**    | `accepted`                                         |
| **Decisores** | Spicy (humano + agente Claude Sonnet 4.x)         |
| **Data**      | 2026-05-09                                         |
| **Tags**      | `arquitetura`, `testes`, `harness`                 |

## Contexto

Este projeto vai exercitar várias implementações de
[`VectorIndexPort`](../../packages/core/src/ports/services/vector-index.port.ts):

- `brute-force` — baseline `O(N · D)`, busca exata, tier-1 de correção.
- `kd-tree`, `vp-tree` — busca exata sub-linear.
- `hnsw`, `ivf`, `lsh` — ANN aproximado (com threshold de imprecisão).

Cada uma tem trade-offs diferentes (velocidade, precisão, memória, custo de
build). Para iterar com confiança — e com agente em loop — precisamos de uma
**referência canônica** contra a qual todas são validadas.

A descrição oficial em `docs/AVALIACAO.md` declara que o teste foi rotulado
usando "k-NN com k=5 e distância euclidiana com brute force" — ou seja, a
**resposta esperada é exatamente o que o brute-force produz**.

## Decisão

`BruteForceVectorIndex` (em `packages/core/src/adapters/services/`) é o
**oráculo** para todas as outras implementações. Especificamente:

1. Fica em `@rinha26/core` (zero deps externas) — pode ser importado sempre,
   inclusive em testes de outros pacotes sem inflar o build.
2. Implementação simples e auditável: loop por todo o array, distância
   euclidiana ao quadrado, top-K via array ordenado. Sem otimizações que
   possam introduzir bugs sutis.
3. Toda nova `VectorIndexPort` impl em `@rinha26/vector-store` precisa passar
   no **set comum de testes de equivalência** (a ser criado em
   `packages/vector-store/src/__contracts__/vector-index.contract.spec.ts`,
   parametrizado por kind), que verifica:
   - Top-K é exatamente igual ao brute-force para um dataset determinístico
     pequeno (≤ 1000 vetores) — **busca exata**.
   - Para impls ANN, top-K tem `recall ≥ 0.95` contra brute-force em dataset
     médio (10k vetores) — **busca aproximada**.
   - Rejeita `k ≤ 0` com `VectorIndexError`.
   - Rejeita vetores de tamanho ≠ 14 com `VectorIndexError`.
   - Retorna no máximo `min(k, |dataset|)` vizinhos.

## Alternativas consideradas

- **Sem oráculo formal — comparar par-a-par no momento da implementação** —
  *Rejeitada* porque vira teste não-determinístico e cada autor cria seu
  próprio dataset de comparação. Quebra a semântica "qualquer impl é
  intercambiável".
- **Oráculo como spec separada (não implementação)** — só descreve o que é
  esperado mas não roda. *Rejeitada* porque toda equivalência precisa
  rodar real para detectar regressões.
- **`@rinha26/test-fixtures` package separado para o oráculo** — mais
  isolamento. *Rejeitada* por overhead — o brute-force já é a impl mais
  simples e cabe no `core` sem dor.
- **Manter o oráculo só nos testes (mocked, sem ser um adapter)** — *Rejeitada*
  porque queremos poder rodar o brute-force também em **produção** como
  fallback (ex.: se HNSW falha em build, cai no brute-force).

## Consequências

### Positivas

- **Confiança em refactor**: qualquer mudança em outra impl é validada
  contra o oráculo automaticamente.
- **Onboarding rápido para nova impl**: o autor só precisa fazer passar nos
  contracts; não precisa inventar dataset/teste.
- **Fallback de produção viável**: brute-force está sempre disponível.

### Negativas / trade-offs

- Dataset determinístico do contracts test fica pequeno (≤ 1000 vetores)
  para o brute-force ser viável em CI (~ms). Não testa correção em escala.
  Mitigação: bench harness (L11) usa datasets maiores.
- "Recall ≥ 0.95" para ANN é arbitrário. Se a Rinha exigir recall maior na
  prática (FN alto), aumentar.

### Riscos

- O brute-force tem um bug (ex.: top-K com tie-break não-determinístico) e
  todas as outras impls "quebram" ao seguir o oráculo errado.
  Mitigação: testes do próprio brute-force (já existem em
  `brute-force-vector-index.spec.ts`) + golden fixtures de exemplos do PRD
  (`vectorize.spec.ts`).

## Implementação

- `packages/core/src/adapters/services/brute-force-vector-index.ts` — impl.
- `packages/core/src/adapters/services/brute-force-vector-index.spec.ts` —
  5 testes cobrindo top-K, k≤0, vetor inválido, k > |dataset|.
- **Próximo passo (Fase 4 ou 5)**: criar
  `packages/vector-store/src/__contracts__/vector-index.contract.spec.ts`
  parametrizado por kind, e fazer cada impl rodá-lo via `it.each`.

## Como revisitar

- Se algum dia o brute-force não couber mais como oráculo (ex.: dataset >
  100k em CI), substituir por uma impl exata mais rápida (KD-tree) que
  ainda passe nos próprios testes de unidade.
- Se a Rinha mudar a métrica de distância (ex.: cosseno em vez de
  euclidiana), atualizar o brute-force aqui e rodar a regressão completa.
