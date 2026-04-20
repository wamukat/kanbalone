# パフォーマンスツール

Kanbalone には、大きな board をローカルで検証するための performance script が含まれます。

## シードデータ作成

1,000 ticket の board を作成します。

```bash
pnpm perf:seed
```

同じ名前の perf board を置き換える場合:

```bash
SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

5,000 ticket の board を作成します。

```bash
SOLOBOARD_PERF_BOARD="Perf 5000" SOLOBOARD_PERF_TICKETS=5000 SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

## ベンチマーク

ベンチマーク一式を実行します。

```bash
pnpm perf:benchmark
SOLOBOARD_PERF_BOARD="Perf 5000" pnpm perf:benchmark
```

## 注意事項

- `perf:seed` は `POST /api/boards/import` を通じて、tags、tickets、comments、blockers、1 階層の parent/child links を作成します。
- 同じ名前の board がある場合、`SOLOBOARD_PERF_OVERWRITE=true` を設定しない限り `perf:seed` は削除しません。
- `perf:benchmark` は `agent-browser` が `PATH` にあるか、`AGENT_BROWSER_BIN` がそれを指していることを期待します。
- Report は `data/perf-seed-report.json` と `data/perf-benchmark-report.json` に出力されます。
