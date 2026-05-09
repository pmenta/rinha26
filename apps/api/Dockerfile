# syntax=docker/dockerfile:1.7
#
# Multi-stage build do `@rinha26/api` (Bun + Elysia).
#
# - Stage 1 `deps`: instala dependências do monorepo (`bun install`). Roda em
#   `linux/amd64` (alvo final) para que os native bindings (`@swc/core`, etc.)
#   sejam baixados para a arquitetura correta — caso contrário, build no Mac M
#   resolve `darwin-arm64` e o runtime no compose explode.
# - Stage 2 `build`: builda `core` + `vector-store` direto com `tsc -b` (sem
#   Nx dentro do container — evita conflitos de native bindings do Nx).
# - Stage 3 `runtime`: cópia mínima — `bun` runtime + `apps/api/src` + `dist/`
#   dos pacotes.
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

# Agora copia o código-fonte completo dos pacotes que serão buildados.
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/ apps/

# Builda core + vector-store via `tsc -b` direto (sem Nx wrapper). Fora os
# arquivos de spec, o build do core gera `packages/core/dist/*.js + .d.ts`.
RUN cd packages/core \
 && bun x tsc --build tsconfig.build.json \
 && cd ../vector-store \
 && bun x tsc --build tsconfig.build.json

# ---------------------------------------------------------------------------- #
# Stage 3 — runtime                                                             #
# ---------------------------------------------------------------------------- #
FROM --platform=linux/amd64 oven/bun:1.1.29-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copia node_modules + dists + sources do que vai rodar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/vector-store/dist ./packages/vector-store/dist
COPY --from=build /app/packages/vector-store/package.json ./packages/vector-store/package.json
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

# Usuário não-root (oven/bun já provê o user `bun`).
USER bun

EXPOSE 3000

# `--smol` reduz o consumo de heap do Bun (vide `AGENTS.md` §11) — útil
# dado o limite global de 350MB no docker-compose.
WORKDIR /app/apps/api
CMD ["bun", "--smol", "run", "src/main.ts"]
