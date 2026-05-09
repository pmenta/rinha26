/**
 * @fileoverview Cópia da tabela oficial de `resources/mcc_risk.json` para uso em
 * testes unitários sem leitura de filesystem.
 */

/** Tabela oficial MCC → risco em `[0, 1]` (`resources/mcc_risk.json`). */
export const OFFICIAL_MCC_RISK: Readonly<Record<string, number>> = {
  '5411': 0.15,
  '5812': 0.30,
  '5912': 0.20,
  '5944': 0.45,
  '7801': 0.80,
  '7802': 0.75,
  '7995': 0.85,
  '4511': 0.35,
  '5311': 0.25,
  '5999': 0.50,
};
