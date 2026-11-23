# CIからリリースまでの自動化

リリースCIを導入した時点の実装仕様です。操作手順は[リリース手順](./release.md)を参照してください。ワークフローの実装と、GitHub上での導入確認は区別します。リポジトリ設定、Actionsでの実行、公開結果の確認は別途必要です。

## 1. 公開までの流れ

```mermaid
flowchart TD
  A[変更PR] --> B[共通CIとDocker検証]
  B --> C[mainへマージ]
  C --> D[Prepare release: バージョンと日英ノートの準備PR]
  D --> E[ノートを完成・レビュー・CI成功・マージ]
  E --> F[Release dry-run: バージョンと完全なSHAを指定]
  F --> G[共通チェック・E2E・Dockerビルド・更新と復元・永続化検証]
  G --> H[検証済みartifactを保存しIDを記録]
  H --> I[同じartifactをローカル確認・公開承認]
  I --> J[Release publish: 同じバージョン・SHA・artifact IDを指定]
  J --> K[成果物の出所・整合性を検証]
  K --> L[タグ・下書きRelease・GHCR公開]
  L --> M[認証なしの取得確認・Release公開]
  M --> N[新しい安定版のみlatest更新]
```

人が決めるのは、変更の受け入れ・バージョン・リリースノート・公開開始です。公開用ワークフローは`main`からのみ起動でき、指定SHAが`main`に含まれることを対象コードの実行前に確認します。

## 2. 実装したワークフロー

| ファイル | 起動 | 処理 |
| --- | --- | --- |
| `verify.yml` | `workflow_call` | frozen install、配布スキル検査、`pnpm check`、Chromium E2E |
| `ci.yml` | PR / main push / 手動 | 共通検証、Dockerビルド・スモーク、固定名 **Required checks** への集約 |
| `prepare-release.yml` | mainから手動 | `codex/release-VERSION`でバージョン・現行配布例・日英ノートの雛形を更新しPR作成 |
| `release.yml` | mainから手動 | dry-runで対象SHAを検証してイメージを保存。公開実行では指定IDの候補を検証し、タグ・GHCR・GitHub Releaseを公開 |
| `pages.yml` | 従来の起動条件 | 製品リリースと独立したドキュメントサイト公開 |

旧`docker-image.yml`、`openapi-lint.yml`、`docker-publish.yml`は置換し、タグpushから直接イメージを公開する経路を廃止しました。

共通検証は[再利用可能なworkflow](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)として実装しています。通常の検証はcontents read、準備PR作成はcontents／pull requests write、公開jobだけがcontents／packages writeを使用します。

## 3. 検証と配布の境界

- 必須CIにパスフィルターはありません。前提ジョブの失敗・中断・skipは集約チェックを失敗させます。
- `pnpm check`でOpenAPI・単体/API・型・docsを確認し、含まれていないChromium E2Eは別ジョブで実行します。ログ・レポートの保存期間は30日です。
- Gitアーカイブに含めるスキルは`skills/kanbalone-api`のみです。`dev/skills`などが混入したら失敗します。Dockerにはスキルを含めません。
- リリース準備で日英ノートを雛形として生成します。レビュー前のマーカーやプレースホルダーが残っていると公開できません。過去の移行例やエビデンスは一括置換しません。
- 対象SHAとpackage/OpenAPIのバージョンを照合します。実行途中にmainの最新へ追従しません。
- dry-runでは`linux/amd64`のDockerイメージをビルドし、隔離した新規volumeで起動・作成・更新・再起動後の読み戻しを検証します。既存ユーザーのデータは使用しません。
- dry-runは検証済みイメージをSHA・イメージID・アーカイブのハッシュとともにartifactへ保存します。公開時はローカルで確認・承認したartifactの`candidate_artifact_id`を指定します。
- 公開実行はこのリポジトリの`main`で成功したdry-run由来のartifactかを確かめ、指定バージョン・SHAとの一致とイメージの整合性を確認します。同じイメージを公開し、ビルド・共通チェック・E2E・更新と復元のテストは繰り返しません。
- GHCRの`vVERSION`／`VERSION`を認証なしでpullし、イメージID・revision・versionを確認します。registry digestとローカルimage IDは別々に記録します。
- RCはlatestを変更しません。安定版でも現在のlatestより新しい場合のみ更新します。

Dockerスモークは[公開前のイメージ検証](https://docs.docker.com/build/ci/github-actions/test-before-push/)に、Kanbaloneの書き込みと永続化確認を加えたものです。既存データの移行・バックアップ・復元検証は別途実施します。 [旧版の更新・復元を検証する PR](https://github.com/wamukat/kanbalone/pull/20)

## 4. 途中失敗と再実行

公開を伴う実行は共通のconcurrencyで直列化し、後続の実行で中断しません。同名タグ・Release・GHCRタグに異なる内容があれば上書きせず停止します。

候補artifactのIDとチェックサムは、公開時に作る注釈付きGitタグに記録します。途中失敗時は同じ公開実行の失敗ジョブを再実行し、当初指定したartifactを使います。artifactの保持期間は30日です。失効・削除され、Gitタグ、Release、レジストリのタグがまだ存在しなければ、dry-run、ローカル確認、公開承認をやり直します。いずれかが存在し、元のartifactを復旧できない場合は、新しいバージョンを準備します。

ユーザーDBのロールバック、稼働コンテナの更新、ローカルKanbaloneのチケット操作はGitHub runnerから行いません。

## 5. GitHubで残る導入確認

1. mainのルールでPRレビューと **Required checks** を必須化し、実際のPRにチェックが紐付くことを確認する。
2. ActionsによるPR作成を許可する。GitHub Appを使用する場合は、必要な権限でインストールし、変数`RELEASE_APP_ID`とシークレット`RELEASE_APP_PRIVATE_KEY`を設定する。
3. App未設定時は`GITHUB_TOKEN`で準備PRを作成し、承認待ちのCIを承認する。App使用時に追加承認なしでCIが動くことも確認する。[GitHub公式のトークン仕様](https://docs.github.com/en/actions/concepts/security/github_token)
4. マージ済みSHAでdry-runを実行し、CI・E2E・Dockerの結果を確認する。ローカル確認に使ったartifactのIDを記録する。
5. 明示的な公開判断後に同じartifactのIDを指定して公開し、タグ・日英ノート・GHCRの認証なし取得を確認する。先行試用でRCを公開した場合は、latestが変わらないことも確認する。途中失敗の再実行も検証する。
6. 既存データの更新・バックアップ・復元検証を隔離fixtureで追加する。 [検証を追加した PR](https://github.com/wamukat/kanbalone/pull/20)

正式版の公開前に、対象版のdry-runとローカル確認の結果を記録します。DB・保存形式・更新手順に影響する場合は、更新と復元の結果も確認します。公開の判断は[リリース手順](./release.md#リリースノートと公開判断)に従います。
