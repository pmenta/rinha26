/**
 * @fileoverview Spec do `GET /diagnostics`.
 */

import { describe, expect, it } from 'vitest';

import { Metrics } from '../metrics.js';
import { diagnosticsController } from './diagnostics.js';

describe('GET /diagnostics', () => {
  it('reflete o estado atual do container (ready, kind, count, metrics)', async () => {
    const metrics = new Metrics();
    metrics.incKnnReal();
    metrics.incKnnReal();
    metrics.incDefaultSafeUseCaseFail();

    const app = diagnosticsController({
      readiness: () => true,
      vectorIndexKind: 'i16-brute-force',
      referenceCount: () => 3_000_000,
      metrics,
    });

    const res = await app.handle(new Request('http://localhost/diagnostics'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ready: true,
      vector_index_kind: 'i16-brute-force',
      reference_count: 3_000_000,
      metrics: {
        knn_real: 2,
        default_safe_use_case_fail: 1,
        default_safe_invalid_body: 0,
        total: 3,
      },
    });
  });

  it('reflete ready=false quando lazy load ainda não terminou', async () => {
    const app = diagnosticsController({
      readiness: () => false,
      vectorIndexKind: 'brute-force',
      referenceCount: () => 0,
      metrics: new Metrics(),
    });
    const res = await app.handle(new Request('http://localhost/diagnostics'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ready: boolean; reference_count: number };
    expect(body.ready).toBe(false);
    expect(body.reference_count).toBe(0);
  });
});
