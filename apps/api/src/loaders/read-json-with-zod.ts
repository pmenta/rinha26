/**
 * @fileoverview Helper `readJsonWithZod` — lê um JSON do filesystem (com suporte
 * transparente a `.gz`) e valida via Zod, retornando `IResult` para integrar com
 * o resto do pipeline.
 *
 * Implementado com `Bun.file(...)` + `DecompressionStream('gzip')` para evitar
 * dependência externa (`zlib`). Fora do hot path — usado só no startup do
 * container, então o custo de stream + parse é aceitável.
 */

import type { IResult } from 'typescript-monads';
import { fail, ok } from 'typescript-monads';
import type { ZodSchema } from 'zod';

import {
  type RepositoryError,
  repositoryError,
} from '@rinha26/core';

/**
 * Lê o arquivo em `path` (gz ou texto puro) e devolve a string descomprimida.
 *
 * Usa `Bun.file` quando disponível (preferido em runtime Bun) e `fs/promises`
 * como fallback nos testes Vitest (Node).
 */
async function readMaybeGzipText(path: string): Promise<string> {
  const isGz = path.endsWith('.gz');

  if (typeof Bun !== 'undefined') {
    const file = Bun.file(path);
    if (!isGz) return file.text();
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  // Fallback Node (Vitest): usa fs.promises + zlib.
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  if (!isGz) return buf.toString('utf-8');
  const { gunzipSync } = await import('node:zlib');
  return gunzipSync(buf).toString('utf-8');
}

/**
 * Lê + parse JSON + validação Zod do conteúdo.
 *
 * @param path     Caminho absoluto ou relativo do arquivo (gz ou json).
 * @param schema   Zod schema para validação.
 */
export async function readJsonWithZod<T>(
  path: string,
  schema: ZodSchema<T>,
): Promise<IResult<T, RepositoryError>> {
  let text: string;
  try {
    text = await readMaybeGzipText(path);
  } catch (cause) {
    return fail<T, RepositoryError>(
      repositoryError(`Falha ao ler arquivo: ${path}`, cause),
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return fail<T, RepositoryError>(
      repositoryError(`JSON inválido em ${path}`, cause),
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail<T, RepositoryError>(
      repositoryError(`Schema inválido em ${path}`, parsed.error),
    );
  }

  return ok<T, RepositoryError>(parsed.data);
}
