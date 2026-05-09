/**
 * @fileoverview Specs dos loaders. Roda contra os arquivos reais em
 * `resources/` (parte do repo, não vão mudar). Usa `path.resolve` a partir do
 * próprio teste para ser independente de cwd.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  loadMccRisk,
  loadNormalization,
  loadReferences,
} from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const resources = path.resolve(here, '../../../../resources');

describe('loadNormalization()', () => {
  it('lê e valida resources/normalization.json com sucesso', async () => {
    const r = await loadNormalization(path.join(resources, 'normalization.json'));
    expect(r.isOk()).toBe(true);
    const norm = r.unwrap();
    expect(norm.max_amount).toBe(10_000);
    expect(norm.max_installments).toBe(12);
    expect(norm.amount_vs_avg_ratio).toBe(10);
    expect(norm.max_minutes).toBe(1_440);
    expect(norm.max_km).toBe(1_000);
    expect(norm.max_tx_count_24h).toBe(20);
    expect(norm.max_merchant_avg_amount).toBe(10_000);
  });

  it('falha com RepositoryError em path inexistente', async () => {
    const r = await loadNormalization('/nonexistent/normalization.json');
    expect(r.isFail()).toBe(true);
    expect(r.unwrapFail()._tag).toBe('RepositoryError');
  });
});

describe('loadMccRisk()', () => {
  it('lê e valida resources/mcc_risk.json com sucesso', async () => {
    const r = await loadMccRisk(path.join(resources, 'mcc_risk.json'));
    expect(r.isOk()).toBe(true);
    const t = r.unwrap();
    expect(t['5411']).toBe(0.15);
    expect(t['7802']).toBe(0.75);
    expect(t['7995']).toBe(0.85);
  });
});

describe('loadReferences()', () => {
  it('lê e valida resources/example-references.json (recorte didático)', async () => {
    const r = await loadReferences(path.join(resources, 'example-references.json'));
    expect(r.isOk()).toBe(true);
    const refs = r.unwrap();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].vector).toHaveLength(14);
    expect(['fraud', 'legit']).toContain(refs[0].label);
  });

  it('lê e valida resources/references.json.gz (descompacta on-the-fly)', async () => {
    const r = await loadReferences(path.join(resources, 'references.json.gz'));
    expect(r.isOk()).toBe(true);
    const refs = r.unwrap();
    // Doc oficial diz 3M registros.
    expect(refs.length).toBe(3_000_000);
    expect(refs[0].vector).toHaveLength(14);
  }, 60_000); // até 60s — descompactar 16MB → 284MB + parse JSON é caro.
});
