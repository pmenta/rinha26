/**
 * @fileoverview Aplica o **contract** comum de `VectorIndexPort` ao baseline
 * `BruteForceVectorIndex`. Garante que a impl de referência (ADR-003) passa
 * nas mesmas premissas que vamos exigir das próximas impls.
 */

import { BruteForceVectorIndex } from '@rinha26/core';

import { runVectorIndexContracts } from '../__contracts__/index.js';

runVectorIndexContracts({
  name: 'BruteForceVectorIndex (exato, oráculo — ADR-003)',
  factory: (refs) => new BruteForceVectorIndex(refs),
  mode: { kind: 'exact' },
});
