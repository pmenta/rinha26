# ADR-000 — Template (não é um ADR real)

> **Como usar**: `cp docs/adr/000-template.md docs/adr/<NNN>-<slug>.md`,
> preencher os campos, comitar **junto** com a mudança técnica que o ADR
> justifica.

| Campo            | Valor                                              |
|------------------|----------------------------------------------------|
| **Status**       | `proposed` / `accepted` / `deprecated` / `superseded by ADR-NNN` |
| **Decisores**    | (lista de pessoas/agentes que assinaram a decisão) |
| **Data**         | YYYY-MM-DD                                         |
| **Tags**         | `arquitetura`, `infra`, `dx`, …                    |

## Contexto

(O **problema** que motivou a decisão. Inclui restrições, requisitos não-funcionais,
e os "drivers" — ex.: "Precisamos de p99 ≤ 10ms com 350MB de RAM total".)

## Decisão

(O que **vamos fazer**. Direto, em 1-3 parágrafos.)

## Alternativas consideradas

- **Alt A** — descrição. *Por que rejeitada*: …
- **Alt B** — descrição. *Por que rejeitada*: …
- (Mínimo 1 alternativa. Se for `accepted` sem alternativa, escrever explicitamente
  por quê — pode ser legítimo, ex.: "única opção compatível com o prazo".)

## Consequências

### Positivas

- …

### Negativas / trade-offs

- …

### Riscos

- …

## Implementação

(Arquivos chave que materializam a decisão. Apontar para commits/PRs quando
relevante.)

## Como revisitar

(O que precisaria mudar para reabrir essa decisão? Ex.: "se p99 baseline cair
abaixo de 1ms, podemos voltar e considerar Alt A".)
