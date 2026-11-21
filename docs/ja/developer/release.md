# リリース手順

GitHub Actionsでリリースを準備・公開します。どちらのワークフローも`main`から実行します。タグのpushだけでは公開されません。

## リポジトリの設定

初回リリース前に、管理者が次を確認します。

- `main`のルールでPRレビューとCIの **Required checks** を必須にする。
- ActionsからのPR作成と、以下のワークフローで使用する権限を許可する。
- このリポジトリからGHCRへ公開でき、利用者が認証なしでイメージを取得できる。
- 必要に応じて、contents／pull requestsのwrite権限を持つGitHub Appをインストールし、リポジトリ変数`RELEASE_APP_ID`とシークレット`RELEASE_APP_PRIVATE_KEY`を設定する。

App未設定の場合、Prepare releaseは`GITHUB_TOKEN`を使用します。準備PRのワークフロー実行が承認待ちになったら承認してください。Appのトークンを使うと、この追加の実行承認を省けます。[GitHub公式のトークン仕様](https://docs.github.com/en/actions/concepts/security/github_token)

ワークフローを追加しただけでは、ブランチ保護・パッケージ公開範囲・Appは設定されません。別途確認してください。

## 1. リリース準備PRを作る

1. **Actions → Prepare release → Run workflow**で`main`を選び、`v`なしのバージョン（例：`1.0.0-rc.1`、`1.0.0`）を入力します。
2. `codex/release-VERSION`ブランチとPRが作成されます。`package.json`、OpenAPI、現在のインストール例、`docs/releases/vVERSION.md`が更新されます。
3. 日英のリリースノートを完成させます。利用者にとっての変更点、破壊的API変更、移行手順、既知の制約を記載し、必要なら移行ガイドをリンクします。両言語のレビュー後にプレースホルダーと`RELEASE_NOTES_DRAFT`マーカーを削除します。
4. 差分をレビューし、**Required checks**の成功を確認してマージします。レビュー済みのリリース内容を含む`main`の完全な40文字のコミットSHAを控えます。

準備ブランチが既にある場合は、上書きせず既存PRを更新します。ブランチ作成後にPR作成だけ失敗した場合は、設定や権限を修正して、その既存ブランチからPRを作成します。過去の移行例やエビデンスのバージョンは変更しません。

## 2. 公開せずに検証する

**Actions → Release → Run workflow**で`main`を選び、次を入力します。

| 入力 | 値 |
| --- | --- |
| `version` | レビュー済みバージョン。`v`なし |
| `sha` | `main`に含まれる完全な40文字の小文字コミットSHA |
| `publish` | `false` |

対象SHA・バージョン・リリースノートを検証し、共通チェックとChromium E2Eを実行します。続いて`linux/amd64`イメージをビルドし、隔離した一時volumeで起動・API書き込み・再起動後の永続化を確認します。

実行結果と`release-image-VERSION` artifactを確認してください。検証済みイメージと、SHA・イメージID・アーカイブのチェックサムを含む`manifest.json`が保存されます。dry-runではタグ・GitHub Release・GHCRイメージを公開しません。既存データの更新やバックアップ復元はこのスモークテストの対象外で、別途リリース前の確認が必要です。

## 3. 公開する

同じバージョン・SHAを指定し、`publish`を`true`にして **Release**を再実行します。この実行でも検証とビルドを行います。その実行内では、検証したイメージartifactを再ビルドせず公開します。

バージョンタグと下書きGitHub Releaseを作成し、`vVERSION`／`VERSION`タグでイメージをpushします。認証なしでpullし、検証済みイメージの実体・ラベルとの一致を確認してから、日英ノートと検証記録を公開します。現在のlatestより新しい安定版のみ`latest`を更新し、RCなどのプレリリースでは更新しません。

公開後はリリースノート、バージョンタグ、認証なしのイメージ取得を確認します。CIログ・テストレポート・リリースartifactの保存期間は30日です。公開記録のregistry digestと、ローカルDockerイメージIDは別の識別子です。

## 失敗時の対応

- 検証に失敗すると公開へ進みません。修正し、レビュー済みのコミットで再検証します。
- 途中まで公開された場合は、同じActions実行の失敗ジョブを再実行し、検証済みイメージartifactを再利用します。既存タグ・Release・イメージが一致しなければ処理は停止します。
- 公開済みタグの移動や、再ビルドした別イメージでの同一バージョン上書きは禁止です。artifactが失効したら調査し、元の検証済み成果物を復旧できない場合は新しいpatch版を準備します。
- 公開済み版の不具合は新しいpatch版で修正します。ユーザーDBのロールバックや稼働中コンテナの更新は、このワークフローでは行いません。

## CIの検証範囲

`ci.yml`は全PRと`main`へのpushで動作し、パスによる除外はありません。`verify.yml`でfrozen install、`pnpm check`、Chromium E2Eを実行します。CIではDockerのビルドとスモークテストも実施し、前提ジョブの失敗・中断・skipを **Required checks** の失敗として扱います。

ソースアーカイブには利用者向けの`skills/kanbalone-api`だけを許可し、`dev/skills`などの開発用スキルの混入を検出します。Dockerにはスキルを含めません。`pages.yml`によるドキュメントサイトの公開は、製品リリースとは独立しています。

[CIの実装状況と導入時の確認事項](./release-ci-plan.md)も参照してください。
