/**
 * @fileoverview Replicação **bit-a-bit** da fórmula de pontuação oficial
 * (`docs/AVALIACAO.md` §"Fórmula da pontuação" e `test/test.js` `handleSummary`).
 *
 * Funções puras — sem I/O, sem dependência de framework. Specs golden em
 * `scoring.spec.ts` validam contra os 8 cenários da tabela de exemplos
 * em `docs/AVALIACAO.md` §"Exemplos de pontuação".
 *
 * Camada **L12** do harness (`AGENTS.md` §12.2).
 */

// --------------------------------------------------------------------------- //
// Constantes (idênticas a test/test.js)                                        //
// --------------------------------------------------------------------------- //

/** Coeficiente do log nas duas componentes do score. */
export const SCORE_K = 1000;
/** Latência de referência (`p99` que dá score 0). */
export const T_MAX_MS = 1000;
/** Piso da latência para o log: abaixo disso satura em +3000. */
export const P99_MIN_MS = 1;
/** Teto da latência: acima disso, corte rígido para −3000. */
export const P99_MAX_MS = 2000;
/** Piso do `epsilon`: abaixo disso satura em +3000. */
export const EPSILON_MIN = 0.001;
/** Multiplicador da penalidade absoluta. */
export const BETA = 300;
/** Limite duro de falhas (% sobre N). Acima disso, corte para −3000. */
export const TX_CORTE = 0.15;
/** Valor do score quando o corte de p99 dispara. */
export const SCORE_P99_CORTE = -3000;
/** Valor do score quando o corte de detecção dispara. */
export const SCORE_DET_CORTE = -3000;

// --------------------------------------------------------------------------- //
// Tipos                                                                        //
// --------------------------------------------------------------------------- //

/** Resultado da classificação de uma única requisição. */
export type Categoria = 'TP' | 'TN' | 'FP' | 'FN' | 'Err';

/** Contagem agregada das 5 categorias. */
export interface Breakdown {
  /** True Positive — fraude corretamente negada. */
  readonly tp: number;
  /** True Negative — legítima corretamente aprovada. */
  readonly tn: number;
  /** False Positive — legítima incorretamente negada. */
  readonly fp: number;
  /** False Negative — fraude incorretamente aprovada. */
  readonly fn: number;
  /** HTTP error (status ≠ 200, timeout, etc.). */
  readonly err: number;
}

/** Resposta JSON esperada de `POST /fraud-score` (`docs/API.md`). */
export interface FraudScoreBody {
  readonly approved: boolean;
  readonly fraud_score: number;
}

/** Componente de score individual com flag de corte. */
export interface ScoreComponent {
  readonly value: number;
  readonly cut_triggered: boolean;
  /** Só populado em `detection_score` quando NÃO houve corte. */
  readonly rate_component?: number;
  readonly absolute_penalty?: number;
}

/**
 * Output completo, com mesmo shape do `test/results.json` do k6 oficial —
 * assim o simulator é trocável pelo k6 nos workflows que comparam scores.
 */
export interface ScoreReport {
  readonly p99_ms: number;
  readonly scoring: {
    readonly breakdown: {
      readonly true_positive_detections: number;
      readonly true_negative_detections: number;
      readonly false_positive_detections: number;
      readonly false_negative_detections: number;
      readonly http_errors: number;
    };
    readonly failure_rate: number;
    readonly weighted_errors_E: number;
    readonly error_rate_epsilon: number;
    readonly p99_score: ScoreComponent;
    readonly detection_score: ScoreComponent;
    readonly final_score: number;
  };
}

// --------------------------------------------------------------------------- //
// Categorização                                                                //
// --------------------------------------------------------------------------- //

/**
 * Classifica uma requisição segundo a matriz de confusão de `docs/AVALIACAO.md`.
 *
 * @param status              Status HTTP devolvido pelo backend (ou null/0 se erro de rede).
 * @param body                Corpo parseado como {@link FraudScoreBody}, ou `null` se não-parseável.
 * @param expectedApproved    `true` quando a transação é legítima; `false` quando é fraude.
 */
export function classify(
  status: number,
  body: FraudScoreBody | null,
  expectedApproved: boolean,
): Categoria {
  if (status !== 200 || body === null || typeof body.approved !== 'boolean') {
    return 'Err';
  }
  if (expectedApproved === body.approved) {
    return body.approved ? 'TN' : 'TP';
  }
  return body.approved ? 'FN' : 'FP';
}

// --------------------------------------------------------------------------- //
// Aplicação da fórmula                                                         //
// --------------------------------------------------------------------------- //

/**
 * Aplica a fórmula completa e produz um {@link ScoreReport}. **Bit-a-bit
 * idêntica** a `test/test.js → handleSummary`, com os mesmos arredondamentos
 * (2 casas) e mesma semântica de cortes.
 */
export function summarize(breakdown: Breakdown, p99Ms: number): ScoreReport {
  const { tp, tn, fp, fn, err } = breakdown;
  const N = tp + tn + fp + fn + err;

  const E = fp * 1 + fn * 3 + err * 5;
  const failures = fp + fn + err;
  const epsilon = N > 0 ? E / N : 0;
  const failureRate = N > 0 ? failures / N : 0;

  // p99 score
  let p99Score: number;
  let p99Cut = false;
  if (p99Ms <= 0) {
    p99Score = 0;
  } else if (p99Ms > P99_MAX_MS) {
    p99Score = SCORE_P99_CORTE;
    p99Cut = true;
  } else {
    p99Score = SCORE_K * Math.log10(T_MAX_MS / Math.max(p99Ms, P99_MIN_MS));
  }

  // Detection score
  let detScore: number;
  let rateComponent = 0;
  let absolutePenalty = 0;
  let detCut = false;
  if (failureRate > TX_CORTE) {
    detScore = SCORE_DET_CORTE;
    detCut = true;
  } else {
    rateComponent = SCORE_K * Math.log10(1 / Math.max(epsilon, EPSILON_MIN));
    absolutePenalty = -BETA * Math.log10(1 + E);
    detScore = rateComponent + absolutePenalty;
  }

  const finalScore = p99Score + detScore;

  // Round 2 decimais para casar bit-a-bit com test/test.js.
  const r2 = (n: number): number => Number(n.toFixed(2));

  return {
    p99_ms: p99Ms,
    scoring: {
      breakdown: {
        true_positive_detections: tp,
        true_negative_detections: tn,
        false_positive_detections: fp,
        false_negative_detections: fn,
        http_errors: err,
      },
      failure_rate: Number((failureRate * 100).toFixed(2)),
      weighted_errors_E: E,
      error_rate_epsilon: Number(epsilon.toFixed(6)),
      p99_score: detCut === false || p99Cut === false
        ? { value: r2(p99Score), cut_triggered: p99Cut }
        : { value: r2(p99Score), cut_triggered: p99Cut },
      detection_score: detCut
        ? { value: r2(detScore), cut_triggered: true }
        : {
            value: r2(detScore),
            cut_triggered: false,
            rate_component: r2(rateComponent),
            absolute_penalty: r2(absolutePenalty),
          },
      final_score: r2(finalScore),
    },
  };
}

// --------------------------------------------------------------------------- //
// Quantil (para p99 a partir de uma coleção de latências)                      //
// --------------------------------------------------------------------------- //

/**
 * Retorna o quantil `q` (0..1) usando o método **nearest-rank** — coerente
 * com o k6 oficial.
 */
export function quantile(samplesMs: readonly number[], q: number): number {
  const n = samplesMs.length;
  if (n === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(n - 1, Math.ceil(q * n) - 1));
  return sorted[rank];
}
