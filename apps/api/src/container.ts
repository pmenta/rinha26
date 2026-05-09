/**
 * @fileoverview Wiring de dependências reais do `@rinha26/api`.
 *
 * Por enquanto (Fase 1):
 * - `references` é um stub vazio — a carga real do `references.json.gz` entra na Fase 2
 *   junto com o Dockerfile que monta `resources/` no container.
 * - `mccRisk` e `normalization` são lidos dos paths em env (defaults para
 *   `./resources/...`), com fallback para constantes embutidas se o arquivo não existir.
 *   Isto vai ser consolidado num `ResourceLoader` próprio na Fase 2.
 *
 * O contrato exposto (`Container`) já é o final — a Fase 2 só substitui a leitura.
 */

import {
  FakeMccRiskTable,
  InMemoryReferenceRepository,
  OFFICIAL_MCC_RISK,
  OFFICIAL_NORMALIZATION,
  type ReferenceVector,
  ScoreTransactionUseCase,
  StaticNormalizationConfig,
} from '@rinha26/core';
import { createVectorIndex, type VectorIndexKind } from '@rinha26/vector-store';

/** Container já com use cases prontos para serem injetados nas rotas. */
export interface Container {
  /** Instância do use case principal. */
  readonly scoreTransaction: ScoreTransactionUseCase;
  /** Função usada pelo `/ready` — devolve `true` quando o índice está pronto. */
  readonly readiness: () => boolean;
  /** Discriminador da implementação ativa (para log). */
  readonly vectorIndexKind: VectorIndexKind;
  /** Quantidade de vetores carregados no índice (para log/diagnóstico). */
  readonly referenceCount: number;
}

/**
 * Carrega tudo necessário para servir `/fraud-score` e `/ready`.
 *
 * **Fase 1**: usa fakes oficiais embutidos (sem leitura de filesystem). A API sobe
 * mas com 0 referências — basta para validar contrato e CI. A leitura real entra
 * na Fase 2 junto com o Dockerfile.
 */
export async function createContainer(): Promise<Container> {
  const vectorIndexKind = (process.env['VECTOR_INDEX_KIND'] ?? 'brute-force') as VectorIndexKind;

  // TODO(fase-2): substituir por leitura streaming de `process.env.REFERENCES_PATH`.
  const references: readonly ReferenceVector[] = [];

  // TODO(fase-2): substituir por leitura + parse Zod de `process.env.MCC_RISK_PATH`.
  const mccRisk = new FakeMccRiskTable(OFFICIAL_MCC_RISK);

  // TODO(fase-2): substituir por leitura + parse Zod de `process.env.NORMALIZATION_PATH`.
  const normalization = new StaticNormalizationConfig(OFFICIAL_NORMALIZATION);

  // Mantemos o repositório no container mesmo sem uso direto agora — adapters de busca
  // produtivos (HNSW) podem precisar dele para rebuild incremental no futuro.
  const _references = new InMemoryReferenceRepository(references);
  void _references;

  const vectorIndex = createVectorIndex(vectorIndexKind, references);
  const ready = references.length > 0;

  const scoreTransaction = new ScoreTransactionUseCase({
    normalization,
    mccRisk,
    vectorIndex,
  });

  return {
    scoreTransaction,
    readiness: () => ready,
    vectorIndexKind,
    referenceCount: references.length,
  };
}
