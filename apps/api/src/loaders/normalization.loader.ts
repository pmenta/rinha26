/**
 * @fileoverview Loader das constantes de `resources/normalization.json` (`docs/DATASET.md`).
 */

import type { IResult } from 'typescript-monads';

import {
  type Normalization,
  NormalizationSchema,
  type RepositoryError,
} from '@rinha26/core';

import { readJsonWithZod } from './read-json-with-zod.js';

/** Lê e valida o `normalization.json`. */
export function loadNormalization(
  path: string,
): Promise<IResult<Normalization, RepositoryError>> {
  return readJsonWithZod(path, NormalizationSchema);
}
