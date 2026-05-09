/**
 * @fileoverview Adapter `FakeMccRiskTable` — implementação in-memory do
 * {@link McccRiskPort}. Útil em testes; em produção, o `apps/api` carrega
 * `resources/mcc_risk.json` e injeta um adapter equivalente.
 */

import { DEFAULT_MCC_RISK } from '../../domain/policies/vectorize.js';
import type { McccRiskPort } from '../../ports/services/mcc-risk.port.js';

/** Tabela MCC → risco (default `0.5` para chaves ausentes). */
export class FakeMccRiskTable implements McccRiskPort {
  private readonly table: ReadonlyMap<string, number>;

  constructor(entries: Readonly<Record<string, number>> = {}) {
    this.table = new Map(Object.entries(entries));
  }

  lookup(mcc: string): number {
    const v = this.table.get(mcc);
    return v ?? DEFAULT_MCC_RISK;
  }
}
