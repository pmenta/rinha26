# ADR-005 — Warmup do JIT no startup + nginx resiliente a cold-start

| Campo         | Valor                                              |
|---------------|----------------------------------------------------|
| **Status**    | `accepted`                                         |
| **Decisores** | Spicy (humano + agente Claude Sonnet 4.x)         |
| **Data**      | 2026-05-09                                         |
| **Tags**      | `infra`, `perf`, `nginx`, `bun`                    |

## Contexto

A primeira requisição ao endpoint `POST /fraud-score` após o startup
da API tem latência **muito acima** das próximas (cold JIT do Bun:
o método `query()` do `VectorIndexPort` só é compilado para hot path
após N invocações).

Sintoma observado durante a Iteração 1 da Fase 5 (commit pré-`ADR-005`):

```
api1 listening
api1 references.bin carregadas (load=800ms) /ready=200
nginx [error] upstream timed out (110: Operation timed out) … 192.168.x.2:3000
nginx [warn]  upstream server temporarily disabled while reading response header
nginx [error] no live upstreams while connecting to upstream …
```

Cascata:
1. Cliente → nginx → api1 (cold JIT) — leva > 2 s para responder.
2. nginx atinge `proxy_read_timeout 2s`, mata a conexão.
3. nginx marca **api1 como `unavailable`** por causa do `max_fails=1`
   default — futuras reqs vão para api2.
4. api2 também tem cold JIT — mesma falha.
5. Ambos os upstreams `unavailable` → nginx responde **502 / "no live
   upstreams"** para qualquer req durante a janela `fail_timeout`.

Resultado prático: **`k6 run test/smoke.js` falhava em 100% das reqs**
mesmo com `/ready=200` na hora do hit, embora todas as próximas
requisições (depois do JIT aquecer) fossem rapidíssimas.

A Engine da Rinha rodaria o `test/test.js` exatamente nesse momento
crítico (Engine espera `/ready` e dispara o teste imediatamente),
provocando exatamente esse cenário e zerando o score.

Análise dos competidores: [`jairoblatt/rinha-2026-node`](https://github.com/jairoblatt/rinha-2026-node)
faz "warmup de 500 queries dummy no `initKnn()`" — exatamente o mesmo
problema, mesma solução.

## Decisão

Combinação de **2 medidas complementares**:

### 1. Warmup do JIT antes de marcar `/ready=true`

Em `apps/api/src/container.ts`, depois de carregar o índice, executar
**20 queries sintéticas** com payload determinístico contra o índice.
Só então marcar `ready = true`.

```ts
function warmup(idx: VectorIndexPort): void {
  const query = [0.5, 0.5, 0.5, 0.5, 0.5, -1, -1, 0.5, 0.5, 0, 1, 0, 0.5, 0.005] as const;
  for (let i = 0; i < 20; i += 1) {
    idx.query(query, 5);
  }
}
```

`N = 20` é escolhido como compromisso:
- V8/JSC compilam o hot path com **3-10 invocações** — 20 dá folga.
- Cada query brute-force sobre 3M vetores leva ~50 ms (host nativo)
  ou ~400 ms (Mac M emulando linux/amd64). N=20 → warmup de 1-8 s.
- N=200 (visto inicialmente) levaria ~10-80 s — empurra `/ready` para
  além de qualquer timeout razoável da Engine.

### 2. nginx resiliente a falhas isoladas

`nginx.conf`:

```nginx
upstream rinha_api {
    server api1:3000 max_fails=0;   # nunca marcar como down
    server api2:3000 max_fails=0;
    keepalive 64;
}

server {
    proxy_connect_timeout 1s;
    proxy_send_timeout    5s;       # antes 2s
    proxy_read_timeout    5s;       # antes 2s
    …
}
```

- `max_fails=0` — **nunca** marcar upstream como `unavailable`. Uma
  réplica com cold JIT temporário não pode tirar metade do round-robin.
- `proxy_read_timeout 5s` — folga para a primeira req real após o
  warmup, sem mascarar p99 ruim em regime quente. **Não viola** o
  timeout do k6 (2001 ms): esse é do **cliente** k6 → nginx; o
  nginx → upstream pode demorar mais (o k6 só timeoutaria primeiro,
  contando como `Err`, mas isso é falha do BACKEND, não do LB).

## Alternativas consideradas

- **Apenas warmup, sem mexer no nginx** — *Rejeitada*: warmup reduz
  o **tempo médio** da 1ª req real, mas alguma req ainda pode
  exceder 2 s em regime degradado (GC pause, page fault inicial). O
  `max_fails=0` torna o sistema robusto a esses outliers.
- **Apenas `max_fails=0`, sem warmup** — *Rejeitada*: a Engine
  começa a bombardear logo após `/ready=200`. Sem warmup, dezenas
  de requests caem no JIT cold em paralelo, todas timeoutam, e mesmo
  sem `unavailable` o cliente k6 conta tudo como `Err` (peso 5 na
  fórmula).
- **Warmup com dataset pequeno (subset)** — *Rejeitada*: o cold JIT
  é por **caminho de código**, não por dataset. A query precisa
  passar pelo loop de scan de 3M elementos para o JIT compilar o
  hot path real.
- **`proxy_next_upstream` agressivo** — testado: nginx reencaminha
  reqs falhas para outras upstreams. Acelera a recuperação mas **não**
  resolve a 1ª onda. Combinação é redundante com `max_fails=0`.
- **Iniciar warmup sem bloquear `/ready`** — *Rejeitada*: a Engine
  da Rinha dispara o teste imediatamente após `/ready=200`. Se warmup
  ainda não terminou, primeira onda volta a falhar.

## Consequências

### Positivas

- **k6 smoke verde** consistentemente após o warmup (medido).
- **Engine da Rinha** vai esperar `/ready=200` (= dataset carregado +
  JIT aquecido), e a primeira onda de carga já vai cair no hot path.
- **Robustez a outliers**: GC pause / page fault em uma réplica não
  derruba a outra.
- **`final_score = 3017`** (vs 1390 antes) — combinação dos efeitos
  do ADR-004 (i16 + 3M dataset real) + ADR-005 (warmup desbloqueando
  o k6).

### Negativas / trade-offs

- **`/ready` demora mais** para virar 200: ~1s (load) + ~1-8s
  (warmup). Em produção nativo amd64 o warmup deve cair para ~1-2s.
  Engine espera; não há gate de tempo de startup.
- **`proxy_read_timeout 5s`** mascara um p99 alto numa única req
  isolada. Justo, porque o teste oficial mede o p99 do **cliente**,
  não do upstream — se o upstream demora 4s mas o k6 timeouts em 2s,
  é `Err` no scoring de qualquer jeito. O timeout maior só **dá uma
  chance** ao backend de responder antes de ser cortado.
- **`max_fails=0`** significa que se uma réplica realmente morrer (não
  responder NUNCA), o nginx vai continuar mandando ~50% do tráfego
  para ela e tudo cai em timeout. Aceitável para o cenário da Rinha
  (réplicas controladas via compose, sem auto-restart por enquanto).

### Riscos

- Warmup com query **fixa** pode não cobrir todos os caminhos de
  código (ex.: branch específico para sentinela `-1`). Mitigação:
  o sentinela já está na query de warmup (índices 5 e 6 = `-1`).
  Riscos remanescentes: pequenos.
- Em produção amd64 nativo, o warmup de 20 queries pode terminar tão
  rápido (~1s) que o JIT não chega a compilar tudo — a engine pode
  pegar a janela. Mitigação: medir no Mac Mini e re-calibrar N se
  necessário.

## Implementação

- `apps/api/src/container.ts` — função `warmup(idx)` chamada após
  `loadBinaryDataset` ou `loadReferences`, antes de `ready = true`.
- `nginx.conf` — `max_fails=0` em ambas as upstreams +
  `proxy_*_timeout 5s`.

## Como revisitar

- Quando rodar de fato no Mac Mini (Engine oficial), medir tempos
  reais de warmup e re-calibrar N. Suspeita: 10 já basta em hardware
  nativo.
- Se entrar Bun FFI (Iteração 5) com Rust nativo (sem JIT relevante),
  warmup vira opcional (só "page fault" do binário). Reduzir N para 5.
- Se entrar HTTP server custom (`Bun.serve()` puro, Iteração 2),
  re-medir comportamento do nginx — talvez tirar `keepalive 64` se
  causar problemas.
