/**
 * @fileoverview Specs da policy `vectorize`. Casos golden vêm direto dos exemplos
 * oficiais em `docs/REGRAS_DE_DETECCAO.md` (transação legítima §"Visão geral do
 * fluxo" e transação fraudulenta §"Exemplo de transação fraudulenta").
 */

import { describe, expect, it } from 'vitest';

import { OFFICIAL_MCC_RISK, OFFICIAL_NORMALIZATION } from '../../__fixtures__/index.js';
import type { FraudTransaction } from '../entities/fraud-transaction.js';
import { vectorize } from './vectorize.js';

const mccRisk = (mcc: string): number => OFFICIAL_MCC_RISK[mcc] ?? 0.5;

describe('vectorize() — exemplo legítimo do PRD §"Visão geral do fluxo"', () => {
  const tx: FraudTransaction = {
    id: 'tx-1329056812',
    transaction: { amount: 41.12, installments: 2, requested_at: '2026-03-11T18:45:53Z' },
    customer: {
      avg_amount: 82.24,
      tx_count_24h: 3,
      known_merchants: ['MERC-003', 'MERC-016'],
    },
    merchant: { id: 'MERC-016', mcc: '5411', avg_amount: 60.25 },
    terminal: { is_online: false, card_present: true, km_from_home: 29.23 },
    last_transaction: null,
  };

  // Vetor canônico do PRD:
  // [0.0041, 0.1667, 0.05, 0.7826, 0.3333, -1, -1, 0.0292, 0.15, 0, 1, 0, 0.15, 0.006]
  const v = vectorize(tx, OFFICIAL_NORMALIZATION, mccRisk);

  it('amount = 41.12 / 10000 ≈ 0.0041', () => expect(v[0]).toBeCloseTo(0.0041, 3));
  it('installments = 2 / 12 ≈ 0.1667', () => expect(v[1]).toBeCloseTo(0.1667, 3));
  it('amount_vs_avg = (41.12 / 82.24) / 10 = 0.05', () => expect(v[2]).toBeCloseTo(0.05, 3));
  it('hour_of_day = 18 / 23 ≈ 0.7826', () => expect(v[3]).toBeCloseTo(0.7826, 3));
  it('day_of_week (qua=2) = 2 / 6 ≈ 0.3333', () => expect(v[4]).toBeCloseTo(0.3333, 3));
  it('minutes_since_last_tx = -1 (last_transaction null)', () => expect(v[5]).toBe(-1));
  it('km_from_last_tx = -1 (last_transaction null)', () => expect(v[6]).toBe(-1));
  it('km_from_home = 29.23 / 1000 ≈ 0.0292', () => expect(v[7]).toBeCloseTo(0.0292, 3));
  it('tx_count_24h = 3 / 20 = 0.15', () => expect(v[8]).toBeCloseTo(0.15, 3));
  it('is_online = 0 (false)', () => expect(v[9]).toBe(0));
  it('card_present = 1 (true)', () => expect(v[10]).toBe(1));
  it('unknown_merchant = 0 (MERC-016 está em known_merchants)', () => expect(v[11]).toBe(0));
  it('mcc_risk("5411") = 0.15', () => expect(v[12]).toBeCloseTo(0.15, 3));
  it('merchant_avg_amount = 60.25 / 10000 ≈ 0.006', () => expect(v[13]).toBeCloseTo(0.006, 3));
  it('vetor tem exatamente 14 dimensões', () => expect(v).toHaveLength(14));
});

describe('vectorize() — exemplo fraudulento do PRD §"Exemplo de transação fraudulenta"', () => {
  const tx: FraudTransaction = {
    id: 'tx-3330991687',
    transaction: { amount: 9505.97, installments: 10, requested_at: '2026-03-14T05:15:12Z' },
    customer: {
      avg_amount: 81.28,
      tx_count_24h: 20,
      known_merchants: ['MERC-008', 'MERC-007', 'MERC-005'],
    },
    merchant: { id: 'MERC-068', mcc: '7802', avg_amount: 54.86 },
    terminal: { is_online: false, card_present: true, km_from_home: 952.27 },
    last_transaction: null,
  };

  // Vetor canônico do PRD:
  // [0.9506, 0.8333, 1.0, 0.2174, 0.8333, -1, -1, 0.9523, 1.0, 0, 1, 1, 0.75, 0.0055]
  const v = vectorize(tx, OFFICIAL_NORMALIZATION, mccRisk);

  it('amount = 9505.97 / 10000 ≈ 0.9506', () => expect(v[0]).toBeCloseTo(0.9506, 3));
  it('installments = 10 / 12 ≈ 0.8333', () => expect(v[1]).toBeCloseTo(0.8333, 3));
  it('amount_vs_avg = clamp((9505.97 / 81.28) / 10) = 1.0', () => expect(v[2]).toBe(1));
  it('hour_of_day = 5 / 23 ≈ 0.2174', () => expect(v[3]).toBeCloseTo(0.2174, 3));
  it('day_of_week (sáb=5) = 5 / 6 ≈ 0.8333', () => expect(v[4]).toBeCloseTo(0.8333, 3));
  it('minutes_since_last_tx = -1', () => expect(v[5]).toBe(-1));
  it('km_from_last_tx = -1', () => expect(v[6]).toBe(-1));
  it('km_from_home = 952.27 / 1000 ≈ 0.9523', () => expect(v[7]).toBeCloseTo(0.9523, 3));
  it('tx_count_24h = 20 / 20 = 1.0', () => expect(v[8]).toBe(1));
  it('is_online = 0', () => expect(v[9]).toBe(0));
  it('card_present = 1', () => expect(v[10]).toBe(1));
  it('unknown_merchant = 1 (MERC-068 NÃO está em known_merchants)', () => expect(v[11]).toBe(1));
  it('mcc_risk("7802") = 0.75', () => expect(v[12]).toBeCloseTo(0.75, 3));
  it('merchant_avg_amount = 54.86 / 10000 ≈ 0.0055', () => expect(v[13]).toBeCloseTo(0.0055, 3));
});

describe('vectorize() — invariantes', () => {
  const baseTx: FraudTransaction = {
    id: 'tx-base',
    transaction: { amount: 100, installments: 1, requested_at: '2026-01-05T12:00:00Z' },
    customer: { avg_amount: 100, tx_count_24h: 1, known_merchants: ['MERC-1'] },
    merchant: { id: 'MERC-1', mcc: '5411', avg_amount: 100 },
    terminal: { is_online: true, card_present: false, km_from_home: 1 },
    last_transaction: null,
  };

  it('todas as dimensões (exceto sentinelas) ficam em [0, 1]', () => {
    const v = vectorize(baseTx, OFFICIAL_NORMALIZATION, mccRisk);
    for (let i = 0; i < v.length; i += 1) {
      if (i === 5 || i === 6) {
        expect(v[i]).toBe(-1);
      } else {
        expect(v[i]).toBeGreaterThanOrEqual(0);
        expect(v[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('clamp em amount: 999_999 → 1.0', () => {
    const v = vectorize(
      { ...baseTx, transaction: { ...baseTx.transaction, amount: 999_999 } },
      OFFICIAL_NORMALIZATION,
      mccRisk,
    );
    expect(v[0]).toBe(1);
  });

  it('mcc desconhecido recebe default 0.5', () => {
    const v = vectorize(
      { ...baseTx, merchant: { ...baseTx.merchant, mcc: '9999' } },
      OFFICIAL_NORMALIZATION,
      mccRisk,
    );
    expect(v[12]).toBe(0.5);
  });

  it('com last_transaction não-null, calcula minutos e km a partir do delta', () => {
    const tx: FraudTransaction = {
      ...baseTx,
      transaction: { ...baseTx.transaction, requested_at: '2026-01-05T13:00:00Z' },
      last_transaction: { timestamp: '2026-01-05T12:00:00Z', km_from_current: 100 },
    };
    const v = vectorize(tx, OFFICIAL_NORMALIZATION, mccRisk);
    expect(v[5]).toBeCloseTo(60 / 1440, 4); // 1h = 60 min
    expect(v[6]).toBeCloseTo(0.1, 3); // 100 / 1000
  });
});
