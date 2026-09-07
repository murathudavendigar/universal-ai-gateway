# Examples

Runnable examples that show how the gateway and provider packages fit together.

| File | Purpose |
|------|---------|
| `gateway.ts` / `gatewayTwo.ts` | Basic chat through the router |
| `openrouter.ts` / `test-stream.ts` | Provider-specific smoke |
| `model-probe.ts` | Hit catalog model IDs; report which still work |
| `perf-smoke.ts` | Latency smoke across live models |
| `coding-bench.ts` | Small coding tasks + quality/speed comparison |

```sh
pnpm exec tsx examples/gateway.ts
pnpm exec tsx examples/model-probe.ts
```

Needs provider keys in the environment or root `.env`.
