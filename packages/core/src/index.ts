/**
 * @fileoverview Pacote `@rinha26/core`: domínio, casos de uso, ports e adapters de
 * teste (fakes/baselines) para a Rinha de Backend 2026.
 *
 * O `core` é a "casca" sem dependência de framework: nenhum import de Bun, Elysia,
 * Fetch, drivers de I/O ou libs de servidor. Adapters reais (HTTP, vector store
 * produtivo, etc.) ficam em `apps/*` e `packages/vector-store`.
 *
 * Veja `AGENTS.md` §3-§7 para a justificativa arquitetural.
 */

export * from './domain/index.js';
export * from './application/index.js';
export * from './ports/index.js';
export * from './adapters/index.js';
export * from './__fixtures__/index.js';
