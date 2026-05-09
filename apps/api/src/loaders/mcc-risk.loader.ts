/**
 * @fileoverview Loader da tabela MCC → risco (`resources/mcc_risk.json`).
 */

import type { IResult } from 'typescript-monads';
import { z } from 'zod';

import type { RepositoryError } from '@rinha26/core';

import { readJsonWithZod } from './read-json-with-zod.js';

const McccRiskFileSchema = z
  .record(z.string(), z.number().min(0).max(1))
  .describe('Tabela MCC → risco em [0, 1] (resources/mcc_risk.json)');

/** Tipo inferido da tabela MCC carregada. */
export type McccRiskTable = z.infer<typeof McccRiskFileSchema>;

/** Lê e valida o `mcc_risk.json`. */
export function loadMccRisk(path: string): Promise<IResult<McccRiskTable, RepositoryError>> {
  return readJsonWithZod(path, McccRiskFileSchema);
}
