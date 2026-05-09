/**
 * @fileoverview Bootstrap do `@rinha26/api` (Bun + Elysia). Lê env, monta o
 * container (com adapters reais) e expõe as rotas em `:PORT` (default `3000`,
 * mapeado para `:9999` pelo nginx no docker-compose — `docs/ARQUITETURA.md`).
 */

import { Elysia } from 'elysia';

import { createContainer } from './container.js';
import { fraudScoreController } from './routes/fraud-score.js';
import { readyController } from './routes/ready.js';

const port = Number(process.env['PORT'] ?? '3000');

const container = await createContainer();

const app = new Elysia()
  .use(readyController(container.readiness))
  .use(fraudScoreController(container.scoreTransaction));

app.listen(port, ({ hostname, port: actualPort }) => {
  // eslint-disable-next-line no-console
  console.log(
    `[@rinha26/api] listening on http://${hostname}:${actualPort} ` +
      `(vector-index=${container.vectorIndexKind}, references=${container.referenceCount})`,
  );
});
