# Submission — `@rinha26` (Spicy)

Esta branch contém **apenas** o necessário para a Engine da Rinha
executar o teste:

- `docker-compose.yml` — referencia uma imagem publicada em
  `ghcr.io/<owner>/rinha26-api` por `.github/workflows/build-image.yml`
  da branch `main`. **A imagem embute o dataset pré-processado**
  (`references.bin`, i16 quantizado, ~83MB) — não precisa de bind mount.
- `nginx.conf` — load balancer round-robin.
- `info.json` — metadados da submissão.

O **código-fonte** vive na branch [`main`](../../tree/main).
