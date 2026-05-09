/**
 * @fileoverview Loader do dataset de referência (`resources/references.json.gz`
 * ou `resources/example-references.json`).
 *
 * **Estratégia atual (Fase 2):** parse único de todo o array em memória, sem
 * pré-processamento binário. Funciona para `example-references.json` (~1900
 * registros) e teoricamente para o `references.json.gz` real (3M registros,
 * ~284MB descomprimido) — mas naquele caso o pico de RAM ultrapassa o limite
 * de 160MB por réplica do compose. **Pré-processamento binário (Float32Array
 * de 14 dimensões + Uint8Array de label) fica para a Fase 5**, junto com a
 * escolha de ANN.
 *
 * Por isso, o env padrão para a Fase 2 aponta para `example-references.json`
 * (subset pequeno) — quando a Fase 5 ligar o dataset completo, basta trocar
 * `REFERENCES_PATH`.
 */

import type { IResult } from 'typescript-monads';
import { z } from 'zod';

import type { ReferenceVector, RepositoryError } from '@rinha26/core';

import { readJsonWithZod } from './read-json-with-zod.js';

/**
 * Schema do arquivo: array de `{ vector: number[14], label: 'fraud'|'legit' }`.
 *
 * **Importante**: aceita `-1` nas posições 5 e 6 (sentinela `last_transaction:null`),
 * por isso usamos `z.number()` puro (sem `min(0).max(1)`).
 */
const ReferencesFileSchema = z
  .array(
    z.object({
      vector: z.array(z.number()).length(14),
      label: z.enum(['fraud', 'legit']),
    }),
  )
  .describe('Array de vetores de 14 dimensões rotulados (resources/references[.json|.json.gz])');

/** Lê e valida o arquivo. */
export function loadReferences(
  path: string,
): Promise<IResult<readonly ReferenceVector[], RepositoryError>> {
  return readJsonWithZod(path, ReferencesFileSchema);
}
