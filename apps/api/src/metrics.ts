/**
 * @fileoverview `Metrics` — contadores in-process leves para instrumentar o
 * caminho do `POST /fraud-score`. Permite distinguir respostas
 * `default-safe` (ADR-002) de respostas reais do KNN, sem afetar a forma
 * do payload (que ficaria invisível ao cliente externo).
 *
 * Sem dep de framework. Sem alocação por incremento. Snapshot devolve
 * objeto novo (imutável) para o `/diagnostics`.
 *
 * **Não persiste**: cada réplica tem seu próprio counter. Para somar entre
 * api1+api2 o cliente faz dois GETs e soma. (Acceptable para harness; em
 * prod real seria Prometheus/OTel.)
 */

/** Snapshot imutável dos contadores. */
export interface MetricsSnapshot {
  /** Reqs em que `useCase.execute(...)` caiu em `IResult.fail` → default-safe. */
  readonly default_safe_use_case_fail: number;
  /** Reqs em que o body do POST não passou no Zod → default-safe. */
  readonly default_safe_invalid_body: number;
  /** Reqs em que o KNN rodou e devolveu `{approved, fraud_score}` real. */
  readonly knn_real: number;
  /** Total = default_safe_use_case_fail + default_safe_invalid_body + knn_real. */
  readonly total: number;
}

/** Contadores mutáveis — instância única por processo (criada no container). */
export class Metrics {
  private dsFail = 0;
  private dsBody = 0;
  private knn = 0;

  /** Incrementa quando o use case retorna `IResult.fail` (`NoNeighborsFound`, etc.). */
  incDefaultSafeUseCaseFail(): void {
    this.dsFail += 1;
  }

  /** Incrementa quando o body do POST falha no `safeParse` Zod. */
  incDefaultSafeInvalidBody(): void {
    this.dsBody += 1;
  }

  /** Incrementa quando o KNN rodou de verdade e devolveu `{approved, fraud_score}`. */
  incKnnReal(): void {
    this.knn += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      default_safe_use_case_fail: this.dsFail,
      default_safe_invalid_body: this.dsBody,
      knn_real: this.knn,
      total: this.dsFail + this.dsBody + this.knn,
    };
  }
}
