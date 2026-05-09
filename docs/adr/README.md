# ADRs — Architecture Decision Records

Decisões arquiteturais não-triviais ficam aqui, em formato
[MADR](https://adr.github.io/madr/) curto (1 página por decisão).

> **Quando criar:** Sempre que uma decisão **não-trivial** for tomada — ex.:
> escolha de algoritmo, política HTTP, decisão de format/storage, escolha
> entre alternativas com trade-offs claros. **Quando NÃO criar:** mudanças
> mecânicas (renomear, extrair concern), bugfixes, configuração trivial.

## Como criar

```bash
cp docs/adr/000-template.md docs/adr/<NNN>-<slug-curto>.md
# preencher; comitar JUNTO com a mudança técnica que o ADR justifica.
```

## Índice

| #     | Título                                                                            | Status     |
|-------|-----------------------------------------------------------------------------------|------------|
| 000   | [Template](./000-template.md)                                                     | —          |
| 001   | [Stack inicial: Bun + Elysia + DDD/Hexagonal + Nx + Vitest](./001-stack-inicial.md) | `accepted` |
| 002   | [Política HTTP `default-safe` no `/fraud-score`](./002-default-safe-http-policy.md) | `accepted` |
| 003   | [`BruteForceVectorIndex` como oráculo de equivalência](./003-brute-force-como-oraculo.md) | `accepted` |
| 004   | [Quantização i16 do dataset + formato `references.bin`](./004-quantizacao-i16.md) | `accepted` |
| 005   | [Warmup do JIT + nginx resiliente a cold-start](./005-warmup-e-nginx-resilience.md) | `accepted` |
