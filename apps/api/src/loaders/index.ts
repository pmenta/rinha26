/**
 * @fileoverview Loaders de recursos persistidos (`resources/*`). Tudo I/O de
 * filesystem fica encapsulado aqui — o `container.ts` só os compõe.
 */

export * from './read-json-with-zod.js';
export * from './mcc-risk.loader.js';
export * from './normalization.loader.js';
export * from './references.loader.js';
