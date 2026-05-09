/**
 * @fileoverview Specs do formato binário (write/read header, validações,
 * cálculo de tamanho).
 */

import { describe, expect, it } from 'vitest';

import {
  BinaryFormatError,
  FORMAT_VERSION,
  HEADER_SIZE,
  MAGIC_BYTES,
  VECTOR_SIZE_BYTES,
  expectedFileSize,
  readHeader,
  writeHeader,
} from './binary-format.js';

describe('constantes do formato', () => {
  it('header tem 32 bytes (alinhamento)', () => expect(HEADER_SIZE).toBe(32));
  it('vetor i16×14 tem 28 bytes', () => expect(VECTOR_SIZE_BYTES).toBe(28));
  it('magic bytes são "R26V"', () =>
    expect(String.fromCharCode(...MAGIC_BYTES)).toBe('R26V'));
  it('versão atual = 1', () => expect(FORMAT_VERSION).toBe(1));
});

describe('expectedFileSize()', () => {
  it('header + vetor*N + label*N', () => {
    expect(expectedFileSize(0)).toBe(HEADER_SIZE);
    expect(expectedFileSize(1)).toBe(HEADER_SIZE + 28 + 1);
    // 3M vetores: 32 + 84M + 3M = 87_000_032 bytes
    expect(expectedFileSize(3_000_000)).toBe(32 + 3_000_000 * 28 + 3_000_000);
  });
});

describe('writeHeader / readHeader roundtrip', () => {
  it('escreve e relê os 32 bytes corretamente', () => {
    const buf = new Uint8Array(HEADER_SIZE + 100);
    const next = writeHeader(buf, {
      version: 1,
      count: 3_000_000,
      dim: 14,
      scale: 8192,
    });
    expect(next).toBe(HEADER_SIZE);

    // Magic bytes literais.
    expect(buf[0]).toBe(0x52);
    expect(buf[1]).toBe(0x32);
    expect(buf[2]).toBe(0x36);
    expect(buf[3]).toBe(0x56);

    // Reserved (byte 20-31) deve ser zero.
    for (let i = 20; i < 32; i += 1) expect(buf[i]).toBe(0);

    const decoded = readHeader(buf);
    expect(decoded).toEqual({
      version: 1,
      count: 3_000_000,
      dim: 14,
      scale: 8192,
    });
  });

  it('escreve com offset != 0', () => {
    const buf = new Uint8Array(100);
    writeHeader(buf, { version: 1, count: 10, dim: 14, scale: 8192 }, 50);
    expect(buf[50]).toBe(0x52);
    const decoded = readHeader(buf, 50);
    expect(decoded.count).toBe(10);
  });
});

describe('readHeader — validações', () => {
  const validBuf = (): Uint8Array => {
    const b = new Uint8Array(HEADER_SIZE);
    writeHeader(b, { version: 1, count: 3, dim: 14, scale: 8192 });
    return b;
  };

  it('falha se buffer < HEADER_SIZE', () => {
    expect(() => readHeader(new Uint8Array(10))).toThrow(BinaryFormatError);
  });

  it('falha em magic inválido', () => {
    const b = validBuf();
    b[0] = 0xff;
    expect(() => readHeader(b)).toThrow(/magic/);
  });

  it('falha em versão diferente da atual', () => {
    const b = validBuf();
    new DataView(b.buffer).setUint32(4, 999, true);
    expect(() => readHeader(b)).toThrow(/vers[ãa]o 999/);
  });

  it('falha em dim ≠ 14', () => {
    const b = validBuf();
    new DataView(b.buffer).setUint32(12, 7, true);
    expect(() => readHeader(b)).toThrow(/dim 7/);
  });

  it('falha em writeHeader se target for muito pequeno', () => {
    const b = new Uint8Array(10);
    expect(() => writeHeader(b, { version: 1, count: 0, dim: 14, scale: 8192 })).toThrow(
      BinaryFormatError,
    );
  });
});
