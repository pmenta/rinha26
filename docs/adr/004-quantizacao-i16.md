# ADR-004 — Quantização i16 do dataset + formato `references.bin`

| Campo         | Valor                                              |
|---------------|----------------------------------------------------|
| **Status**    | `accepted`                                         |
| **Decisores** | Spicy (humano + agente Claude Sonnet 4.x)         |
| **Data**      | 2026-05-09                                         |
| **Tags**      | `arquitetura`, `infra`, `perf`, `dataset`          |

## Contexto

O dataset oficial (`docs/DATASET.md`) tem **3.000.000 vetores × 14
dimensões × `f32`** = 168 MB de RAM apenas para os vetores, mais headers
e overhead de objetos JS. Carregando como `ReferenceVector[]` com
`vector: number[]` e `label: string`, o consumo real em Bun chega
facilmente a **300+ MB** por réplica — **estoura** o limite de 160 MB
por réplica do `docker-compose.yml` (`docs/ARQUITETURA.md`).

Análise dos competidores ([`jairoblatt/rinha-2026-rust`](https://github.com/jairoblatt/rinha-2026-rust),
[`jairoblatt/rinha-2026-node`](https://github.com/jairoblatt/rinha-2026-node))
mostra padrão repetido: **quantização para `i16`** com escala fixa, +
**arquivo binário compacto embutido na imagem** via `include_bytes!()`.

## Decisão

1. **Quantização `i16` com escala 8192 (= 2¹³)**:
   - Cada coordenada `f64 ∈ [0, 1]` (ou `-1` sentinela) vira `i16` via
     `Math.round(value * 8192)` clamp em `[I16_MIN, I16_MAX]`.
   - Escala potência de 2 facilita futura migração para shifts (>>13)
     em vez de divisão (importa em SIMD).
   - Sentinela `-1` (last_transaction:null) vira `-8192` — dentro do
     range, mantém comportamento de "longe de tudo" no espaço vetorial.
   - **Precisão fracional ≈ 1.22 × 10⁻⁴** — mais que suficiente para
     vetores derivados das fórmulas de `docs/REGRAS_DE_DETECCAO.md`
     (que já têm precisão prática de `0.01` no payload).

2. **Formato binário `references.bin`** (vide
   `packages/vector-store/src/i16/binary-format.ts`):
   ```
    offset  size   campo
    0       4      magic         "R26V" (0x52 0x32 0x36 0x56)
    4       4      version: u32  (= 1)
    8       4      count:   u32
    12      4      dim:     u32  (= 14)
    16      4      scale:   f32  (= 8192.0)
    20      12     reserved      zero-fill (alinha header em 32B)
    32      28×N   vectors[N]    14 i16 contíguos por vetor
    32+28N  N      labels[N]     u8: 'F' = fraud, 'L' = legit
   ```
   - **Header de 32 bytes** alinha o início dos vetores em múltiplo de 32
     (= linha AVX2 / 4 linhas de cache de 8 bytes) — prepara para SIMD.
   - **Labels separados** dos vetores (não inline por vetor) — cache
     locality: o KNN só consulta labels para top-K (≤ 5), não para
     todos os 3M vetores.

3. **Pipeline**:
   - **Build time** (Dockerfile stage `build`):
     `bun packages/vector-store/scripts/preprocess.ts` lê
     `resources/references.json.gz` e produz `resources/references.bin`.
   - **Runtime**: `loadBinaryDataset(path)` lê o `.bin` com
     `Bun.file().arrayBuffer()` e cria **views** `Int16Array` +
     `Uint8Array` apontando para o **mesmo `ArrayBuffer`** (zero-copy).
   - O `references.bin` é **embutido na imagem Docker** (igual a
     `include_bytes!()` em Rust) — eliminado bind mount de resources
     em runtime.

4. **`I16BruteForceVectorIndex.fromQuantized({vectors, labels, count})`**
   é o adapter de produção. `.fromReferenceVectors(refs)` existe para
   testes (mantém `refs` original para top-K bit-a-bit).

## Alternativas consideradas

- **Manter `f32`/`f64`** — *Rejeitada* porque estoura o limite de
  RAM por réplica. A perda de detecção pela quantização é desprezível
  (recall = 1.0 medido nos contracts test em `mode: 'exact'`).
- **Quantização `i8` (escala 127)** — *Rejeitada*: precisão insuficiente
  (~7.9 × 10⁻³ por dimensão). Para vetores em `[0, 1]` com 14 dimensões,
  o ruído acumulado pode ser ~3% — afeta detecção em queries com top-K
  borderline.
- **Escala 10000** (decimal) — *Rejeitada* em favor de 8192 (potência
  de 2) por compatibilidade futura com SIMD shifts.
- **Bind mount de `references.bin` em runtime** (em vez de embedded
  na imagem) — *Rejeitada* porque complica a branch `submission`
  (Engine teria que ter o arquivo no host) e adiciona I/O de filesystem
  no startup.
- **`mmap` real do arquivo** (lib externa) — *Rejeitada* por enquanto:
  `Bun.file().arrayBuffer()` carrega o arquivo inteiro em RAM como
  `ArrayBuffer` único — efeito prático **idêntico** para dataset
  estático de 83 MB. Reconsiderar se chegarmos a datasets > 2 GB.

## Consequências

### Positivas

- **RAM**: 168 MB → **84 MB** (50% menos) por réplica para os vetores.
- **Performance**: bench L11 mostra **4.86× melhor p99** para N = 10.000
  (1.31 ms → 0.27 ms) — cache hits dominam o brute-force.
- **Imagem**: 83 MB extras na imagem Docker, mas elimina necessidade
  de bind mount de resources (simplifica branch `submission`).
- **Pipeline reproduzível**: o `.bin` é gerado deterministicamente do
  `.json.gz` no build do Docker (sem skew entre dev/prod).
- **Pronto para SIMD**: alinhamento de 32B + escala potência de 2
  facilitam port para WASM SIMD (Iteração 3) e Bun FFI / AVX2
  (Iteração 5).

### Negativas / trade-offs

- **Perda de precisão** controlada (~1.22 × 10⁻⁴ por dim). Em testes
  determinísticos, top-K coincide bit-a-bit com brute-force `f32`. Em
  produção pode haver casos borderline em que a ordem muda — não afeta
  classificação binária (`approved`) na grande maioria dos casos.
- **Build mais demorado** (preprocess de 3M vetores leva ~2.4s no
  build). Aceitável (uma vez por imagem, com cache).
- **Imagem maior** (~165 MB final vs ~80 MB sem dataset embutido).

### Riscos

- **Quantização não-monotônica**: se um dia a fórmula de
  `docs/REGRAS_DE_DETECCAO.md` aceitar valores fora de `[-1, 1]`, o
  clamp do quantizador silenciosamente perderia precisão. Mitigação:
  a função `floatToI16` clamp explicitamente em `I16_MIN/MAX` e o
  `vectorize.ts` clamp em `[0, 1]` antes da quantização.
- **Arquitetura big-endian**: o formato é little-endian explícito.
  `linux/amd64` (alvo da Rinha) é LE — sem problema. O `binary-loader`
  asserta isso no startup.

## Implementação

- `packages/vector-store/src/i16/quantize.ts` — `floatToI16`,
  `i16ToFloat`, `quantizeFeatureVectorInto`.
- `packages/vector-store/src/i16/binary-format.ts` — `writeHeader`,
  `readHeader`, constantes do formato.
- `packages/vector-store/src/i16/binary-loader.ts` — `loadBinaryDataset`
  zero-copy.
- `packages/vector-store/src/i16/i16-brute-force-vector-index.ts` —
  adapter com 2 factories.
- `packages/vector-store/scripts/preprocess.ts` — script CLI invocado
  no build do Docker.
- `apps/api/Dockerfile` — stage `build` chama preprocess + stage
  `runtime` copia o `.bin` final.
- `apps/api/src/container.ts` — caminho otimizado quando
  `VECTOR_INDEX_KIND=i16-brute-force`.

## Validação medida (Mac M / arm64 emulando linux/amd64)

| Cenário | Antes (f32, 100 vetores) | Depois (i16, 3M vetores) |
|---|---:|---:|
| Tamanho do dataset em runtime | < 1 MB | **83 MB** |
| Carga (`/ready`) | ~200 ms | ~800 ms (load) + ~8 s (warmup, ADR-005) |
| `p99` query (`bun simulate --limit 5000`) | 201 ms | **3.00 ms** |
| `final_score` (simulator) | 1390.08 | **3016.63** |
| `Err` HTTP | 0 | **0** |

Em produção (Mac Mini Late 2014 amd64 nativo, sem emulação), a
expectativa é que tudo seja ~7× mais rápido (warmup ~1s, p99 < 1ms).

## Como revisitar

- Quando WASM SIMD entrar (Iteração 3), considerar mudar para
  `i16` com escala diferente que case com 8 lanes simultâneas.
- Se o dataset oficial mudar para D > 14, revalidar precisão da
  quantização (ruído acumulado escala com √D).
- Se houver ANN na Fase posterior, o índice ANN consome espaço extra
  além dos `i16` — re-checar orçamento de RAM.
