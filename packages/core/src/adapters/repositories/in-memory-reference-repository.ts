/**
 * @fileoverview Adapter `InMemoryReferenceRepository` — fake do
 * {@link ReferenceRepositoryPort}. Recebe a lista no construtor e devolve em `loadAll`.
 */

import type { IResult } from 'typescript-monads';
import { ok } from 'typescript-monads';

import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import type { RepositoryError } from '../../domain/errors/infrastructure.errors.js';
import type { ReferenceRepositoryPort } from '../../ports/repositories/reference-repository.port.js';

/** Implementação trivial em memória — só usar em testes ou bench pequeno. */
export class InMemoryReferenceRepository implements ReferenceRepositoryPort {
  constructor(private readonly references: readonly ReferenceVector[]) {}

  loadAll(): Promise<IResult<readonly ReferenceVector[], RepositoryError>> {
    return Promise.resolve(ok<readonly ReferenceVector[], RepositoryError>(this.references));
  }
}
