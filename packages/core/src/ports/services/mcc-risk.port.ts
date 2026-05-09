/**
 * @fileoverview Port `McccRiskPort` — lookup de risco por MCC com fallback `0.5`.
 *
 * Implementações: `FakeMccRiskTable` (testes) e a tabela carregada de
 * `resources/mcc_risk.json` no startup do `apps/api`.
 */

/** Contrato síncrono de lookup. */
export interface McccRiskPort {
  /**
   * Devolve o risco em `[0, 1]` para um dado MCC. **Sempre** retorna um número —
   * MCCs ausentes recebem o default oficial (`0.5`, ver `docs/DATASET.md`).
   */
  lookup(mcc: string): number;
}
