/**
 * @fileoverview Use case `ScoreTransactionUseCase` — orquestra vetorização + KNN +
 * decisão para responder `POST /fraud-score`. Sem I/O direto: usa apenas ports.
 */

import type { IResult } from 'typescript-monads';
import { fail, ok } from 'typescript-monads';

import type { ScoreResult } from '../../domain/entities/score-result.js';
import {
  type FraudError,
  noNeighborsFound,
} from '../../domain/errors/fraud.errors.js';
import type { InfrastructureError } from '../../domain/errors/infrastructure.errors.js';
import { decide, FRAUD_THRESHOLD, KNN_K } from '../../domain/policies/decide.js';
import { vectorize } from '../../domain/policies/vectorize.js';
import type { McccRiskPort } from '../../ports/services/mcc-risk.port.js';
import type { NormalizationConfigPort } from '../../ports/services/normalization.port.js';
import type { VectorIndexPort } from '../../ports/services/vector-index.port.js';

import type { ScoreTransactionInput } from './score-transaction.input.js';

/** Union dos erros possíveis do use case. */
export type ScoreTransactionError = FraudError | InfrastructureError;

/**
 * Composição mínima das dependências do use case (todas via ports).
 *
 * Wiring real fica em `apps/api/src/container.ts`. Em testes unitários, fakes do
 * próprio `packages/core` (em `adapters/`) são usados para controlar o cenário.
 */
export interface ScoreTransactionDeps {
  readonly normalization: NormalizationConfigPort;
  readonly mccRisk: McccRiskPort;
  readonly vectorIndex: VectorIndexPort;
  /** `k` do KNN. Default {@link KNN_K} (regra do desafio). */
  readonly k?: number;
  /** Limiar de aprovação. Default {@link FRAUD_THRESHOLD} (regra do desafio). */
  readonly threshold?: number;
}

/**
 * Use case puro. Recebe input já validado (schema na borda) e devolve `IResult`.
 *
 * Sequência:
 * 1. {@link vectorize} — converte payload em vetor de 14 dimensões.
 * 2. {@link VectorIndexPort.query} — top-`k` vizinhos.
 * 3. {@link decide} — `fraud_score` + `approved`.
 *
 * Erros:
 * - `VectorIndexError` quando o índice falha.
 * - `NoNeighborsFound` quando o índice retorna `[]`.
 */
export class ScoreTransactionUseCase {
  private readonly k: number;
  private readonly threshold: number;

  constructor(private readonly deps: ScoreTransactionDeps) {
    this.k = deps.k ?? KNN_K;
    this.threshold = deps.threshold ?? FRAUD_THRESHOLD;
  }

  /** Executa o pipeline completo. */
  execute(input: ScoreTransactionInput): IResult<ScoreResult, ScoreTransactionError> {
    const norm = this.deps.normalization.get();
    const featureVector = vectorize(input, norm, (mcc) => this.deps.mccRisk.lookup(mcc));

    const queryResult = this.deps.vectorIndex.query(featureVector, this.k);
    if (queryResult.isFail()) {
      return fail<ScoreResult, ScoreTransactionError>(queryResult.unwrapFail());
    }

    const neighbors = queryResult.unwrap();
    if (neighbors.length === 0) {
      return fail<ScoreResult, ScoreTransactionError>(noNeighborsFound());
    }

    return ok<ScoreResult, ScoreTransactionError>(decide(neighbors, this.threshold));
  }
}
