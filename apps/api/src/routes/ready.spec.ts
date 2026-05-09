/**
 * @fileoverview Spec da rota `GET /ready` — usa Elysia em-memória (`.handle(Request)`),
 * sem precisar abrir socket.
 */

import { describe, expect, it } from 'vitest';

import { readyController } from './ready.js';

describe('GET /ready', () => {
  it('retorna 200 + { status: "ok" } quando isReady()=true', async () => {
    const app = readyController(() => true);
    const res = await app.handle(new Request('http://localhost/ready'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('retorna 503 + { status: "loading" } quando isReady()=false', async () => {
    const app = readyController(() => false);
    const res = await app.handle(new Request('http://localhost/ready'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'loading' });
  });
});
