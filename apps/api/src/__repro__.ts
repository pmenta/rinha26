import {
  BruteForceVectorIndex, FakeMccRiskTable, OFFICIAL_MCC_RISK,
  OFFICIAL_NORMALIZATION, ScoreTransactionUseCase, StaticNormalizationConfig,
} from '@rinha26/core';
import { fraudScoreController } from './routes/fraud-score.js';

const refs = Array.from({ length: 5 }, (_, i) => ({
  label: 'fraud' as const,
  vector: [1,1,1,1,1,-1,-1,1,1,0,1,1,0.85,0.5].map((x) => x - i*1e-4) as readonly number[],
}));

const useCase = new ScoreTransactionUseCase({
  normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
  mccRisk: new FakeMccRiskTable(OFFICIAL_MCC_RISK),
  vectorIndex: new BruteForceVectorIndex(refs),
});

const app = fraudScoreController(useCase);

const body = {
  id: 'tx-3330991687',
  transaction: { amount: 9505.97, installments: 10, requested_at: '2026-03-14T05:15:12Z' },
  customer: { avg_amount: 81.28, tx_count_24h: 20, known_merchants: ['MERC-008'] },
  merchant: { id: 'MERC-068', mcc: '7802', avg_amount: 54.86 },
  terminal: { is_online: false, card_present: true, km_from_home: 952.27 },
  last_transaction: null,
};

const req = new Request('http://localhost/fraud-score', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

try {
  const res = await app.handle(req);
  console.log('status:', res.status);
  console.log('body:', await res.text());
} catch (e) {
  console.error('THROWN:', e);
}
