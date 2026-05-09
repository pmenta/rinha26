/**
 * @fileoverview Specs **golden** da fórmula de pontuação. Cada caso vem direto
 * da tabela "Exemplos de pontuação" em `docs/AVALIACAO.md` (todos com N=5000)
 * + 2 casos extra para `classify`.
 */

import { describe, expect, it } from 'vitest';

import { classify, quantile, summarize } from './scoring.js';

describe('classify()', () => {
  it('aprovada legítima → TN', () =>
    expect(classify(200, { approved: true, fraud_score: 0 }, true)).toBe('TN'));

  it('negada fraude → TP', () =>
    expect(classify(200, { approved: false, fraud_score: 1 }, false)).toBe(
      'TP',
    ));

  it('negada legítima → FP', () =>
    expect(classify(200, { approved: false, fraud_score: 1 }, true)).toBe(
      'FP',
    ));

  it('aprovada fraude → FN', () =>
    expect(classify(200, { approved: true, fraud_score: 0 }, false)).toBe(
      'FN',
    ));

  it('status 500 → Err', () =>
    expect(classify(500, null, true)).toBe('Err'));

  it('status 200 mas body null/inválido → Err', () => {
    expect(classify(200, null, true)).toBe('Err');
    // body sem campo approved boolean
    expect(
      classify(
        200,
        { approved: 'yes' as unknown as boolean, fraud_score: 0 },
        true,
      ),
    ).toBe('Err');
  });
});

describe('quantile() — nearest-rank (idem k6)', () => {
  it('p50 de 1..10 = 5', () =>
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5));

  it('p99 de 1..100 = 99', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(quantile(arr, 0.99)).toBe(99);
  });

  it('lista vazia → 0', () => expect(quantile([], 0.99)).toBe(0));
});

describe('summarize() — golden contra docs/AVALIACAO.md "Exemplos de pontuação"', () => {
  // Todos os exemplos da tabela usam N=5000.
  // Vamos compor `tp + tn` para fechar N e validar p99/detection/final.

  const cases = [
    {
      label: 'cenário 1: 0 erros, p99=1ms → 6000',
      breakdown: { tp: 1750, tn: 3250, fp: 0, fn: 0, err: 0 },
      p99: 1,
      expected: { p99: 3000, det: 3000, final: 6000 },
    },
    {
      label: 'cenário 2: 5 FP + 5 FN, p99=3ms → 4524.15',
      breakdown: { tp: 1745, tn: 3245, fp: 5, fn: 5, err: 0 },
      p99: 3,
      expected: { p99: 2522.88, det: 2001.27, final: 4524.15 },
    },
    {
      label: 'cenário 3: 0 erros, p99=100ms → 4000',
      breakdown: { tp: 1750, tn: 3250, fp: 0, fn: 0, err: 0 },
      p99: 100,
      expected: { p99: 1000, det: 3000, final: 4000 },
    },
    {
      label: 'cenário 4: 30 FP + 20 FN, p99=10ms → 3157.02',
      breakdown: { tp: 1730, tn: 3220, fp: 30, fn: 20, err: 0 },
      p99: 10,
      expected: { p99: 2000, det: 1157.02, final: 3157.02 },
    },
    {
      label: 'cenário 5: 100 FP + 50 FN, p99=300ms → 1104.01',
      breakdown: { tp: 1700, tn: 3150, fp: 100, fn: 50, err: 0 },
      p99: 300,
      expected: { p99: 522.88, det: 581.13, final: 1104.01 },
    },
    {
      label: 'cenário 6: 500 FP + 250 FN (failure_rate=15%, no limite) → 371.85',
      breakdown: { tp: 1500, tn: 2750, fp: 500, fn: 250, err: 0 },
      p99: 200,
      expected: { p99: 698.97, det: -327.12, final: 371.85 },
    },
    {
      label: 'cenário 7: 500 FP + 300 FN (failure_rate=16%, dispara corte) → -1000',
      breakdown: { tp: 1450, tn: 2750, fp: 500, fn: 300, err: 0 },
      p99: 10,
      expected: { p99: 2000, det: -3000, final: -1000 },
    },
    {
      label: 'cenário 8: tudo Err, p99=60s → -6000',
      breakdown: { tp: 0, tn: 0, fp: 0, fn: 0, err: 5000 },
      p99: 60_000,
      expected: { p99: -3000, det: -3000, final: -6000 },
    },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const r = summarize(c.breakdown, c.p99);
      expect(r.scoring.p99_score.value).toBeCloseTo(c.expected.p99, 1);
      expect(r.scoring.detection_score.value).toBeCloseTo(c.expected.det, 1);
      expect(r.scoring.final_score).toBeCloseTo(c.expected.final, 1);
    });
  }

  it('inclui breakdown e taxas brutas para audit trail', () => {
    const r = summarize(
      { tp: 1730, tn: 3220, fp: 30, fn: 20, err: 0 },
      10,
    );
    expect(r.scoring.breakdown).toEqual({
      true_positive_detections: 1730,
      true_negative_detections: 3220,
      false_positive_detections: 30,
      false_negative_detections: 20,
      http_errors: 0,
    });
    expect(r.scoring.failure_rate).toBeCloseTo(1.0, 2); // 50/5000 = 1%
    expect(r.scoring.weighted_errors_E).toBe(30 * 1 + 20 * 3); // 90
  });
});
