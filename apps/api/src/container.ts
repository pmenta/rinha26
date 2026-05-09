/**
 * @fileoverview Wiring de dependências reais do `@rinha26/api`.
 *
 * **Estratégia (Fase 2)**:
 *
 * 1. `mcc_risk.json` e `normalization.json` são **bloqueantes** no startup
 *    (centenas de bytes, parse rápido). Sem eles a API não pode vetorizar.
 *
 * 2. `references.json[.gz]` (3M registros, ~284MB) é carregado em **background**
 *    (não bloqueia o `Bun.serve`). Enquanto não terminar:
 *      - `/ready` devolve `503 {status:"loading"}`.
 *      - `/fraud-score` cai na política default-safe (`200 {approved:true,fraud_score:0}`).
 *
 * 3. `VECTOR_INDEX_KIND` (default `brute-force`) define a impl de
 *    `VectorIndexPort` usada — todas registradas em `@rinha26/vector-store`.
 *
 * Vide `AGENTS.md` §10 para a tabela completa de env vars.
 */

import {
  FakeMccRiskTable,
  type ReferenceVector,
  ScoreTransactionUseCase,
  StaticNormalizationConfig,
  type VectorIndexPort,
} from '@rinha26/core';
import {
  I16BruteForceVectorIndex,
  createVectorIndex,
  loadBinaryDataset,
  type VectorIndexKind,
} from '@rinha26/vector-store';

import { loadMccRisk } from './loaders/mcc-risk.loader.js';
import { loadNormalization } from './loaders/normalization.loader.js';
import { loadReferences } from './loaders/references.loader.js';

/** Container já com use cases prontos para serem injetados nas rotas. */
export interface Container {
  /** Instância do use case principal. */
  readonly scoreTransaction: ScoreTransactionUseCase;
  /** Função usada por `GET /ready` — `true` quando o índice está pronto. */
  readonly readiness: () => boolean;
  /** Discriminador da implementação ativa (para log). */
  readonly vectorIndexKind: VectorIndexKind;
  /** Snapshot da contagem atual de vetores no índice (atualiza após lazy load). */
  readonly referenceCount: () => number;
}

/** Caminhos default coerentes com o `Dockerfile` da Fase 2 (`/app/resources/...`). */
function defaultPaths() {
  // Quando rodando com `bun --cwd apps/api`, fallback para `../../resources/...`.
  // No container Docker, vamos definir essas envs explicitamente.
  return {
    /** JSON ou .gz original (3M vetores). Usado quando `VECTOR_INDEX_KIND=brute-force`. */
    references:
      process.env['REFERENCES_PATH'] ?? '../../resources/example-references.json',
    /**
     * Bin pré-processado (i16, ~83MB para o dataset oficial). Usado quando
     * `VECTOR_INDEX_KIND=i16-brute-force`. Gerado por
     * `bun packages/vector-store/scripts/preprocess.ts` no build do Docker.
     */
    referencesBin:
      process.env['REFERENCES_BIN_PATH'] ?? '../../resources/references.bin',
    mccRisk: process.env['MCC_RISK_PATH'] ?? '../../resources/mcc_risk.json',
    normalization:
      process.env['NORMALIZATION_PATH'] ?? '../../resources/normalization.json',
  };
}

/**
 * Carrega tudo necessário para servir `/fraud-score` e `/ready`.
 *
 * Returns assim que `mcc_risk` + `normalization` carregaram (ms). O dataset de
 * referências carrega em background — `referenceCount()` reflete o estado.
 */
export async function createContainer(): Promise<Container> {
  const vectorIndexKind = (process.env['VECTOR_INDEX_KIND'] ??
    'brute-force') as VectorIndexKind;

  const paths = defaultPaths();

  // Bloqueante: sem normalization a vetorização explode. Sem mcc_risk, todas
  // as transações receberiam o default 0.5 — degrada a detecção mas funciona.
  const [normResult, mccResult] = await Promise.all([
    loadNormalization(paths.normalization),
    loadMccRisk(paths.mccRisk),
  ]);

  if (normResult.isFail()) {
    throw new Error(
      `[@rinha26/api] Falha ao carregar normalization (${paths.normalization}): ` +
        normResult.unwrapFail().message,
    );
  }
  const normalization = new StaticNormalizationConfig(normResult.unwrap());

  if (mccResult.isFail()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@rinha26/api] Aviso: MCC risk não carregado (${paths.mccRisk}). ` +
        `Usando tabela vazia (fallback 0.5 para todos os MCCs).`,
    );
  }
  const mccRisk = new FakeMccRiskTable(mccResult.isOk() ? mccResult.unwrap() : {});

  // Estado mutável apenas durante a janela de lazy load — depois fica estável.
  let referenceCount = 0;
  // Empty references → factory devolve um índice "vazio" só para o caso edge
  // antes do lazy load completar. Trocado por outro com refs reais ao final.
  let vectorIndex: VectorIndexPort = createVectorIndex(
    vectorIndexKind,
    [] as readonly ReferenceVector[],
  );
  let ready = false;

  /**
   * Executa N queries sintéticas para aquecer o JIT do Bun antes de marcar
   * `/ready=true`. Sem isso, a primeira requisição real demora muito mais
   * que `proxy_read_timeout` do nginx (5s) — provoca cascata `upstream
   * temporarily disabled` no LB. Padrão visto em todas as soluções
   * competitivas (`jairoblatt-rust`, `jairoblatt-node`).
   *
   * **N pequeno**: cada query brute-force sobre 3M vetores leva ~50-400ms
   * (CPU nativo / emulado). 20 queries são suficientes para o JIT compilar
   * o hot path (V8/JSC: ~3-10 invocações). N maior empurra `/ready` para
   * dezenas de segundos sem ganho mensurável.
   */
  function warmup(idx: VectorIndexPort): void {
    const query = [
      0.5, 0.5, 0.5, 0.5, 0.5, -1, -1, 0.5, 0.5, 0, 1, 0, 0.5, 0.005,
    ] as const;
    for (let i = 0; i < 20; i += 1) {
      idx.query(query, 5);
    }
  }

  // Background load do dataset (não bloqueia o startup do listen).
  void (async () => {
    const t0 = performance.now();
    try {
      if (vectorIndexKind === 'i16-brute-force') {
        // Caminho otimizado: lê o `references.bin` pré-quantizado direto
        // como Int16Array + Uint8Array (zero-copy), sem JSON parse.
        const ds = await loadBinaryDataset(paths.referencesBin);
        vectorIndex = I16BruteForceVectorIndex.fromQuantized(ds);
        referenceCount = ds.count;
        const tLoad = performance.now();
        warmup(vectorIndex);
        const tWarm = performance.now();
        // eslint-disable-next-line no-console
        console.log(
          `[@rinha26/api] references.bin carregadas via i16-brute-force ` +
            `(${referenceCount.toLocaleString()} vetores, ` +
            `${(ds.fileSizeBytes / 1024 / 1024).toFixed(1)} MB, ` +
            `load=${(tLoad - t0).toFixed(0)}ms warmup=${(tWarm - tLoad).toFixed(0)}ms). ` +
            `/ready agora retorna 200.`,
        );
      } else {
        // Caminho legacy: JSON/JSON.gz → ReferenceVector[] em float.
        const r = await loadReferences(paths.references);
        if (r.isFail()) {
          throw new Error(
            `Falha ao carregar references (${paths.references}): ${r.unwrapFail().message}`,
          );
        }
        const refs = r.unwrap();
        vectorIndex = createVectorIndex(vectorIndexKind, refs);
        referenceCount = refs.length;
        const tLoad = performance.now();
        warmup(vectorIndex);
        const tWarm = performance.now();
        // eslint-disable-next-line no-console
        console.log(
          `[@rinha26/api] references carregadas ` +
            `(${refs.length.toLocaleString()} vetores, ` +
            `load=${(tLoad - t0).toFixed(0)}ms warmup=${(tWarm - tLoad).toFixed(0)}ms). ` +
            `/ready agora retorna 200.`,
        );
      }
      ready = true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[@rinha26/api] ${String(e)}`);
    }
  })();

  // O use case captura `vectorIndex` por closure indireta — usamos um proxy para
  // que a swap atrás do background load seja vista pelas próximas requisições.
  const vectorIndexProxy: VectorIndexPort = {
    query: (q, k) => vectorIndex.query(q, k),
  };

  const scoreTransaction = new ScoreTransactionUseCase({
    normalization,
    mccRisk,
    vectorIndex: vectorIndexProxy,
  });

  return {
    scoreTransaction,
    readiness: () => ready,
    vectorIndexKind,
    referenceCount: () => referenceCount,
  };
}
