/**
 * @fileoverview Adapter `SystemClock` — implementação real do {@link ClockPort}
 * baseada em `Date.now()`.
 */

import type { ClockPort } from '../../ports/services/clock.port.js';

/** Relógio do sistema. Em testes use um fake (`{ now: () => new Date('...') }`). */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
