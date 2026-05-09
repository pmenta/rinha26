/**
 * @fileoverview Entidade `FraudTransaction` — payload de entrada de
 * `POST /fraud-score` (`docs/API.md`). Imutável; toda manipulação produz cópia.
 */

/** Bloco `transaction` do payload (valor, parcelas, timestamp). */
export interface FraudTransactionTx {
  /** Valor monetário da transação. */
  readonly amount: number;
  /** Número de parcelas. */
  readonly installments: number;
  /** Timestamp UTC ISO-8601 (`requested_at`). */
  readonly requested_at: string;
}

/** Bloco `customer` (histórico do portador do cartão). */
export interface FraudTransactionCustomer {
  /** Média histórica de gasto do portador. */
  readonly avg_amount: number;
  /** Quantidade de transações nas últimas 24h. */
  readonly tx_count_24h: number;
  /** Comerciantes já utilizados pelo portador (pode conter duplicatas). */
  readonly known_merchants: readonly string[];
}

/** Bloco `merchant` (comerciante onde a transação foi feita). */
export interface FraudTransactionMerchant {
  readonly id: string;
  /** Merchant Category Code — chave para `mcc_risk.json`. */
  readonly mcc: string;
  /** Ticket médio do comerciante. */
  readonly avg_amount: number;
}

/** Bloco `terminal` (canal/dispositivo de captura). */
export interface FraudTransactionTerminal {
  /** `true` quando a transação ocorre online (não presencial). */
  readonly is_online: boolean;
  /** `true` quando o cartão está fisicamente presente no terminal. */
  readonly card_present: boolean;
  /** Distância em km do endereço cadastrado do portador. */
  readonly km_from_home: number;
}

/** Bloco `last_transaction` — pode ser `null` quando não houver transação anterior. */
export interface FraudTransactionLastTx {
  /** Timestamp UTC ISO-8601 da transação anterior. */
  readonly timestamp: string;
  /** Distância em km entre a transação anterior e a atual. */
  readonly km_from_current: number;
}

/**
 * Payload completo recebido em `POST /fraud-score`. Reflete diretamente o contrato em
 * {@link https://github.com/zanfranceschi/rinha-de-backend-2026 docs/API.md}.
 *
 * Imutável: todos os campos são `readonly`. A entidade não tem comportamento — quem
 * decide é a policy de vetorização (`vectorize.ts`) + o use case
 * `ScoreTransactionUseCase`.
 */
export interface FraudTransaction {
  /** Identificador da transação (ex.: `tx-1329056812`). */
  readonly id: string;
  readonly transaction: FraudTransactionTx;
  readonly customer: FraudTransactionCustomer;
  readonly merchant: FraudTransactionMerchant;
  readonly terminal: FraudTransactionTerminal;
  /** `null` quando esta é a primeira transação registrada do portador. */
  readonly last_transaction: FraudTransactionLastTx | null;
}
