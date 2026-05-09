/**
 * @fileoverview Adapters embutidos no `@rinha26/core`: implementações *fake* (in-memory)
 * usadas em testes e um baseline brute-force que serve para validar implementações
 * mais sofisticadas (em `packages/vector-store`) por equivalência.
 *
 * **Importante**: estes adapters **não dependem** de Bun, Elysia ou qualquer driver
 * externo — são puros TS, mantendo `@rinha26/core` framework-free.
 */

export * from './repositories/index.js';
export * from './services/index.js';
