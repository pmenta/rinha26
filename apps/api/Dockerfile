# syntax=docker/dockerfile:1.7
#
# Multi-stage build do `@rinha26/api` (Bun + Elysia).
#
# - Stage 1 `deps`: instala dependências do monorepo (`bun install`). Roda em
#   `linux/amd64` (alvo final) para que os native bindings (`@swc/core`, etc.)
#   sejam baixados para a arquitetura correta — caso contrário, build no Mac M
#   resolve `darwin-arm64` e o runtime no compose explode.
# - Stage 2 `build`: builda `core` + `vector-store` direto com `tsc -b` (sem
#   Nx dentro do container — evita conflitos de native bindings do Nx). Em
#   seguida, **pre-processa** o `references.json.gz` em `references.bin`
#   (i16 quantizado, ~83MB, cf. `docs/adr/004-quantizacao-i16.md`).
# - Stage 3 `runtime`: cópia mínima — `bun` runtime + `apps/api/src` + `dist/`
#   dos pacotes + os 3 arquivos de `resources/` (sem o `.gz` original, que
#   já foi consumido pelo preprocess).
#
# Imagem: `oven/bun:1.1.29` (Debian slim, glibc). NÃO usar `-alpine` aqui:
# `nx-22` e alguns nativos não distribuem build `linux-*-musl` para todas as
# arquiteturas usadas no monorepo.

# ---------------------------------------------------------------------------- #
# Stage 1 — deps                                                                #
# ---------------------------------------------------------------------------- #
FROM --platform=linux/amd64 oven/bun:1.1.29 AS deps

WORKDIR /app

# Copia só os manifestos para maximizar cache de install.
COPY package.json bunfig.toml ./
COPY bun.lockb* bun.lock* ./
COPY nx.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/vector-store/package.json packages/vector-store/
COPY apps/api/package.json apps/api/

# `bun install` (sem `--frozen-lockfile` para que arquiteturas variantes
# resolvam seus próprios native bindings amd64 dentro do container).
RUN bun install

# ---------------------------------------------------------------------------- #
# Stage 2 — build                                                               #
# ---------------------------------------------------------------------------- #
FROM --platform=linux/amd64 deps AS build

WORKDIR /app

# Agora copia o código-fonte completo.
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/ apps/
# Copia o dataset gzipado para servir de input ao preprocess. Não vai pro
# runtime stage — só o `.bin` derivado.
COPY resources/ resources/

# Builda core + vector-store via `tsc -b` direto (sem Nx wrapper).
RUN cd packages/core \
 && bun x tsc --build tsconfig.build.json \
 && cd ../vector-store \
 && bun x tsc --build tsconfig.build.json

# Pre-processa o dataset: 3M vetores → references.bin (~83MB i16 quantizado).
# Roda uma única vez no build e é embedded na imagem final — zero I/O de
# parse/descomprimir em runtime.
RUN bun packages/vector-store/scripts/preprocess.ts \
 && ls -lh resources/references.bin

# ---------------------------------------------------------------------------- #
# Stage 3 — runtime                                                             #
# ---------------------------------------------------------------------------- #
FROM --platform=linux/amd64 oven/bun:1.1.29-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Defaults coerentes com o caminho dos arquivos copiados abaixo.
ENV VECTOR_INDEX_KIND=i16-brute-force
ENV REFERENCES_BIN_PATH=/app/resources/references.bin
ENV MCC_RISK_PATH=/app/resources/mcc_risk.json
ENV NORMALIZATION_PATH=/app/resources/normalization.json

# Copia node_modules + dists + sources do que vai rodar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/vector-store/dist ./packages/vector-store/dist
COPY --from=build /app/packages/vector-store/package.json ./packages/vector-store/package.json
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

# Resources runtime: SÓ o que é lido em hot path. NÃO copiamos o `.gz`
# (~50MB) nem o `example-references.json` (didático).
COPY --from=build /app/resources/references.bin ./resources/references.bin
COPY --from=build /app/resources/mcc_risk.json ./resources/mcc_risk.json
COPY --from=build /app/resources/normalization.json ./resources/normalization.json

# Usuário não-root (oven/bun já provê o user `bun`).
USER bun

EXPOSE 3000

# `--smol` reduz o consumo de heap do Bun (vide `AGENTS.md` §11) — útil
# dado o limite global de 350MB no docker-compose.
WORKDIR /app/apps/api
CMD ["bun", "--smol", "run", "src/main.ts"]
