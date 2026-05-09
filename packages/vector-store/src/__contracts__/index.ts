/**
 * @fileoverview Barrel dos **contracts test** de `VectorIndexPort` — utilitários
 * compartilhados que toda implementação deve passar.
 *
 * Toda nova implementação adicionada em `@rinha26/vector-store` (KD-tree,
 * VP-tree, HNSW, IVF, …) deve ter um `*.contract.spec.ts` que invoca
 * {@link runVectorIndexContracts} (ou o próprio adapter ser chamado a partir
 * de outro pacote, ex.: `apps/api`, para validação de regressão).
 *
 * Inspiração: ADR-003 (`docs/adr/003-brute-force-como-oraculo.md`) e
 * `AGENTS.md` §12.2 camada **L10**.
 */

export * from './synthetic-dataset.js';
export * from './vector-index.contract.js';
