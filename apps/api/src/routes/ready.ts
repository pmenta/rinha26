/**
 * @fileoverview Rota `GET /ready` — `2xx` quando o índice estiver carregado e a
 * API pronta para receber tráfego (`docs/API.md`, `docs/ARQUITETURA.md`).
 */

import { Elysia, status } from 'elysia';

/**
 * Factory: aceita uma função `isReady` e devolve a Elysia instance da rota.
 * Mantemos o serviço como função porque `/ready` é trivial — não justifica classe.
 *
 * Nota: o tipo de retorno **não é anotado** intencionalmente — Elysia depende de
 * inferência paramétrica para preservar metadados de rotas (path, body, response).
 * Anotar com `: Elysia` apaga isso e quebra `.use(...)`/composição.
 */
export const readyController = (isReady: () => boolean) =>
  new Elysia().get('/ready', () => {
    if (isReady()) {
      return { status: 'ok' };
    }
    return status(503, { status: 'loading' });
  });
