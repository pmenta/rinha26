/**
 * @fileoverview Pacote `@rinha26/vector-store`: implementações reais do
 * `VectorIndexPort` (`@rinha26/core`).
 *
 * Na Fase 1 só existe o `brute-force` (reexportado do core). KD-tree, VP-tree, HNSW
 * etc. entram nas Fases 4-5.
 */

export * from './brute-force/index.js';
export * from './i16/index.js';
export { I16BruteForceVectorIndex } from './i16/i16-brute-force-vector-index.js';
export type { QuantizedDataset } from './i16/i16-brute-force-vector-index.js';
export * from './factory.js';
