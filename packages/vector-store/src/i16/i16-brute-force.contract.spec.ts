/**
 * @fileoverview Aplica o `runVectorIndexContracts` ao
 * {@link I16BruteForceVectorIndex} construído via `fromReferenceVectors`
 * (caminho compatível com `mode: 'exact'` — devolve as referências originais
 * bit-a-bit nos top-K).
 *
 * **Nota sobre quantização e equivalência exata**: a quantização para `i16`
 * com escala 8192 introduz ruído máximo de ±0.5/8192 ≈ 6.1×10⁻⁵ por
 * dimensão. Esse ruído **pode** mudar a ordem de top-K quando dois vetores
 * de referência têm distância muito próxima da query. No dataset
 * determinístico do contract (1k vetores, queries fora do conjunto), esse
 * caso é raro a ponto de o spec passar — mas se um dia falhar com flake,
 * trocar o `mode` para `'ann'` com `recallMin: 0.99`.
 */

import { runVectorIndexContracts } from '../__contracts__/index.js';

import { I16BruteForceVectorIndex } from './i16-brute-force-vector-index.js';

runVectorIndexContracts({
  name: 'I16BruteForceVectorIndex (exato, fromReferenceVectors)',
  factory: (refs) => I16BruteForceVectorIndex.fromReferenceVectors(refs),
  mode: { kind: 'exact' },
});
