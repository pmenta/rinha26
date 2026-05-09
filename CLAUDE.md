# `@rinha26` — guia para Claude

Este projeto adota um único documento vivo: **[`AGENTS.md`](./AGENTS.md)**.

Tudo que você (Claude) precisa para se onboarding está lá:

- Visão e regras do desafio (Rinha de Backend 2026 — detecção de fraude por busca vetorial).
- Stack, comandos `nx` / `bun`, workflow de PR com `gh`.
- Estrutura DDD/hexagonal do monorepo (`packages/core`, `packages/vector-store`,
  `apps/api`).
- Padrão de Use Case + regra de `IResult<T, E>`.
- Estratégia de TDD, JSDoc obrigatório em PT-BR, módulos boundaries por `scope:*`.
- Hurdles, env vars, DoD pós-implementação, inventário de componentes.

**Antes de qualquer ação**, leia `AGENTS.md` (e atualize-o se descobrir algo novo —
ele é a "spec que evolui", inspirada em
[Akita, 2026](https://akitaonrails.com/2026/02/20/do-zero-a-pos-producao-em-1-semana-como-usar-ia-em-projetos-de-verdade-bastidores-do-the-m-akita-chronicles/#o-claudemd-a-spec-que-evolui)).

> **Filosofia:** o humano decide o **quê**. Você decide o **como**.
> Disciplina (TDD + small releases + refactor contínuo + CI) é o que separa um produto
> real de uma demo.
