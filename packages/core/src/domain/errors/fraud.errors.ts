/**
 * @fileoverview Erros do bounded context **Detecção** (vetorização + KNN + decisão).
 */

/** Payload veio com formato/tipos inválidos (ex.: timestamp não-ISO, parcelas negativas). */
export interface InvalidFraudPayload {
  readonly _tag: 'InvalidFraudPayload';
  /** Mensagem legível para diagnóstico (não destinada a usuário final). */
  readonly message: string;
  /** Caminho dentro do payload onde o erro foi detectado (ex.: `transaction.amount`). */
  readonly path?: string;
}

/** Sucedeu vetorização mas o índice vetorial devolveu vazio (não encontrou nenhum vizinho). */
export interface NoNeighborsFound {
  readonly _tag: 'NoNeighborsFound';
}

/** Union agregada dos erros de domínio do contexto Detecção. */
export type FraudError = InvalidFraudPayload | NoNeighborsFound;

/** Construtor do erro {@link InvalidFraudPayload}. */
export function invalidFraudPayload(message: string, path?: string): InvalidFraudPayload {
  return { _tag: 'InvalidFraudPayload', message, path };
}

/** Construtor do erro {@link NoNeighborsFound}. */
export function noNeighborsFound(): NoNeighborsFound {
  return { _tag: 'NoNeighborsFound' };
}
