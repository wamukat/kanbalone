# Kanbaloneの位置づけと製品比較

調査日: 2026-11-22。Kanbaloneの評価対象: v1.0.0（`0bf19d1b21536457e503068c7b6d2340e93b30e3`）。

更新確認: 2026-11-28。初回の実機・定量比較は上記v1.0.0の記録として残し、現在のKanbaloneはmain `92571d1` を基準に実装を照合した。公開版v1.6.0や利用者の実行環境と、このmainを同一視しない。競合の実機比較は再実施していない。

## 結論

Kanbaloneが磨く軸は、**外部の依頼を保ちながら、個人とAIの実作業を手元で進めること**。
「軽量」「OSS」「API」「AI連携」のどれか一つを独占的な強みにしない。これらを備える他製品もある。
選んでもらう理由は、依頼の読み直し、AIへの説明し直し、受け入れ判断、外部への報告にかかる負担を、小さな操作体系で減らすことに置く。

利用者向けの短い説明は[製品の位置づけ](../product-positioning.md)にまとめる。本書はその説明を評価・更新するための開発資料である。

## 訴求方針の合意（2026-11-23）

ユーザーとの議論で、**「登録やログインが不要で、課題管理はローカルで完結する気軽さ」**を、Kanbaloneの強みとしてもっと前面に出す方針を確認した。利用者向け説明の冒頭で伝え、外部連携を使わず自分の作業から始められることを明確にする。

- 中心となる表現: 「登録もログインも不要。課題管理はローカルで完結。」
- 伝える価値: 個人の課題管理を始めるために、アカウント作成やログイン、組織・ユーザー管理を必要としない気軽さ。
- 外部トラッカーやAIとの連携は任意。「完全にローカル」という表現を、外部AI利用時もデータが外へ出ないという意味では使わない。
- 他製品にない独占的機能とは主張しない。[KanBots OSS Desktop](https://github.com/leodavinci1/kanbots/blob/main/docs/getting-started.md)もアカウント不要を明記し、[Local mode](https://github.com/leodavinci1/kanbots/blob/main/docs/issues.md)は認証・同期・リモート接続不要。[Kanboard](https://docs.kanboard.org/v1/admin/installation/)もローカル運用できるが、アプリ内の管理者ログインがある。2026-11-23に公式資料を確認した比較であり、今回の実機検証ではない。

## インストール・起動の比較と訴求方針（2026-11-23）

**Dockerがあればすぐ始められ、起動後の設定がほとんどいらない点を強みとして打ち出す。** ユーザーとの議論で、この方針を確認した。登録・ログイン不要という仕様を、「すぐ自分の仕事を整理し始められる」という利用者の価値につなげる。

推奨する表現:

> Dockerで起動。ボードを作れば、すぐ課題管理。登録もログインも、外部サービスの設定も不要です。

### 比較結果（2026-11-23の導入手順調査）

| 製品 | インストール・起動 | 最初の課題を作るまで | 評価 |
| --- | --- | --- | --- |
| Kanbalone | Dockerを用意し、公開イメージをコマンド一つで起動。ブラウザで開く | ボード名を入力して作成すると標準レーンが揃う。登録・ログイン不要 | Docker導入済みなら準備が少なく、起動後の管理設定もほぼ不要 |
| Kanboard | Dockerで起動可能。保存先を設定 | 初期管理者ログイン、パスワード変更、プロジェクト作成後にタスク作成 | 起動自体は簡単。主な差は起動後のアカウント操作 |
| Vikunja | Docker構成、URL・保存先などを設定。SQLiteも利用可能 | ローカルユーザー登録・ログイン後に作業を登録 | 設定項目が多め。前回実機では保存先の書込権限調整も必要だった |
| Redmine | Docker Official ImageのSQLite構成なら簡単に起動可能 | 管理者ログイン・パスワード変更、初期設定確認、プロジェクト作成後に課題作成 | 起動より、利用開始までの管理操作に手間がある |
| KanBots | デスクトップ版またはNode/npm環境から `npx kanbots`。Windowsのnpx経路はインストーラー案内 | Gitリポジトリを選びLocal modeでカード作成。アカウント不要 | Docker不要の有力な対抗例。Gitリポジトリが前提。未署名アプリの初回起動対応がある |

### 根拠と比較条件

2026-11-23に公式手順を確認し、[2026-11-22のローカル構築記録](product-hands-on-comparison.md#2-構築結果)と照合した。新たなクリーン環境での導入時間計測は行っていない。前回実機はKanbalone 1.0.0、Kanboard 1.2.58、Vikunja 2.8.0、Redmine 7.0.3。当時のKanbaloneの手順はREADME（v1.1.0表記）も参照した。現在の導入手順は[Docker起動案内](docker-image-distribution.md)を参照。KanBotsは公式資料による確認のみ。

- [Kanboard Docker](https://docs.kanboard.org/v1/admin/docker/)・[初期ログイン](https://docs.kanboard.org/v1/admin/installation/)
- [Vikunja Docker構成](https://vikunja.io/docs/full-docker-example/)。外部DBは必須ではなく、前回実機はSQLite。保存先の権限調整はOS・マウント方法に依存する。
- [Redmine Docker Official Image](https://hub.docker.com/_/redmine)。SQLiteによる単純な起動を比較対象に含め、Rubyや外部DBの手動構築を必須とは扱わない。
- [KanBots導入](https://github.com/leodavinci1/kanbots/blob/main/docs/getting-started.md)・[npx起動](https://github.com/leodavinci1/kanbots/blob/main/npx-cli/README.md)

課題管理の開始とAI実行の準備は分ける。KanBotsのAI CLI導入・認証を、カード作成までの必須手順として加算しない。Jira Cloudなどインストール不要のSaaSは、今回のローカル完結の比較とは別条件。

### 言える強みと残る負担

Kanbaloneは、Dockerが使える環境ならアプリ用の言語環境や別DBを構築せず起動でき、ボード作成後すぐに課題を登録できる。Gitリポジトリや外部サービスの準備も不要なので、コードがない企画や個人的な作業から始められる。

一方、Docker自体の導入、ターミナル操作、ブラウザでURLを開く手間は残る。READMEの基本手順では終了後の再開にも起動コマンドを使う。「起動後の設定がほとんどいらない」は訴求するが、「誰でも導入から最速」「数秒で必ず使える」「Docker未導入でもデスクトップ製品より簡単」とは主張しない。初回イメージ取得の待ち時間も含め、所要時間の優位は未測定。

## 比較の範囲と方法

- 組織の課題管理としてRedmineとJira Cloud、比較的範囲を絞ったOSSとしてKanboardとVikunjaを選んだ。RedmineもOSSであり、「組織向け」と「OSS」は対立する分類ではない。
- 「軽量」は対象業務や設定・操作の範囲を指す。本書の仕様比較ではCPU、メモリ、起動時間、応答速度の優劣を測定していない。[別資料のAPI計測](api-ui-performance-comparison.md)は旧版・100件・ローカル環境に限定した結果であり、一般的な性能順位ではない。
- 本書の表は公式サイト・公式ドキュメントによる比較。[別途行ったローカル実機比較](product-hands-on-comparison.md)ではRedmine・Kanboard・Vikunja・Kanbaloneを操作した。広告上の「簡単」「速い」を実証結果として扱わない。
- JiraはCloudの公式機能を対象とする。プラン差・権限・追加アプリによる差があり、Data Centerへの一般化や価格比較は行わない。
- OSS側もホスト型とセルフホスト、有償機能を混同しない。Vikunjaは無償AGPL版に加え、管理機能などを追加する任意のProがある。[公式説明](https://vikunja.io/docs/pro/)
- 以下の「適する場面」「Kanbaloneへの示唆」は、確認した機能からの考察。未掲載の機能を「存在しない」と断定しない。プラグイン全体の調査でもない。

## 利用者の声による補足

[利用者の定性的な評価](product-community-research.md)では、Reddit・製品コミュニティ・個別レビューの不満と好意的な評価を整理した。Jiraの設定負担、Vikunjaの保存・並べ替えへの不安、Kanboardの簡素さ、Redmineの業務上の価値を、時点・環境・修正確認と分けて扱う。

公式仕様の比較だけでは見えない負担を拾う資料であり、人気や安定性の順位付けではない。

## 誰の何を楽にするか

| 製品 | 公式情報から確認した主な仕組み | 適する場面という考察 | Kanbaloneへの示唆 |
| --- | --- | --- | --- |
| Redmine | 複数プロジェクト、役割別権限、課題種別・役割別ワークフロー、工数、Wiki。セルフホスト可能なOSS。[概要](https://www.redmine.org/)・[機能](https://www.redmine.org/projects/redmine/wiki/features) | チームの正式な記録、進行ルール、工数を一緒に管理する | 組織全体の管理を再実装せず、既存の依頼から個人の実作業へ移る負担を減らす |
| Jira Cloud | チーム横断の計画、依存関係、複数ビュー、自動化、Rovoによる支援。[公式機能](https://www.atlassian.com/software/jira/features) | 複数チームの作業を関連付け、共通の仕組みで進める | AI協働そのものを独自機能と呼ばない。個人が導入・運用する範囲の小ささを磨く |
| Kanboard | シンプルさを掲げるセルフホストOSS。WIP制限、検索、サブタスク、コメント、自動アクション。[公式概要](https://kanboard.org/) | 作業の流れを見渡し、進行中の仕事を絞る | 単に「小さなKanban」では近い。外部原文と手元の実装文脈を分ける使い方まで伝える |
| Vikunja | 個人のTo-doから共有・担当付けへ広げられるセルフホストOSS。List/Kanban/Gantt/Tableを提供。[公式概要](https://vikunja.io/) | 自分のタスクを幅広く整理し、必要なら他者とも共有する | ローカル所有や複数ビューだけでは差別化にならない。開発中の引き継ぎと受入に焦点を絞る |
| Kanbalone v1.0.0 | 外部原文とローカル本文の分離、選択コメント送信、GUI/API、個人向けの状態・関係。[仕様](../concepts.md) | チームの課題管理を使いつつ、自分とAIの調査・実装・確認を手元で続ける | 強みの組み合わせを、継続して使いやすい一連の操作として完成させる |

Kanbaloneで現在取り込める外部IssueはGitHub Issues、GitLab、Redmine。**Jiraは比較対象であり、現行の取り込み対応先ではない**。Jira利用者にも同じ体験を提供できると宣伝しない。

## APIやAI接続は、独自性の根拠として十分か

十分ではない。

- Redmineには課題などを扱うREST APIがある。[公式API](https://www.redmine.org/projects/redmine/wiki/Rest_api)
- Kanboardにはアプリケーション用・ユーザー用APIがあり、後者では権限を確認する。[公式API](https://docs.kanboard.org/v1/api/)
- Jiraには外部AIクライアントから検索・作成・更新できる公式Rovo MCP Serverがあり、既存のアクセス権を尊重する。[公式ガイド](https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/)
- VikunjaにはAPIがあり、公式ヘルプは2.7.0以降のMCP接続と権限付きトークンを案内している。[API](https://vikunja.io/docs/api-documentation/)・[MCP](https://vikunja.io/help/mcp/)

Kanbaloneの価値仮説は、**依頼を受け取る → ローカルで調査・実装を深める → 人が確認する → 必要な報告を返す**という流れを、個人が管理できる範囲でつなぐこと。
他製品でも設定や連携で同様の運用を作れる可能性がある。「唯一できる」ではなく、この用途を標準の設計としてどれだけ迷わず使えるかを競う。

また、二つの場所で管理する分、最新状態の確認や報告の手間は生まれる。単に個人タスクを記録したい人には、KanboardやVikunjaだけで十分な場合もある。Kanbaloneを追加する価値が、増える往復を上回るかを検証する必要がある。

## キーボード操作の比較

他製品は2026-11-28に再確認した公式資料、Kanbaloneは現在のソースを根拠にする。仕様の存在と、同条件での作業速度・使いやすさの優劣は区別する。

| 製品 | 公式に確認できる操作 | 考察 |
| --- | --- | --- |
| Redmine | 新規課題、編集、検索などのaccesskey。OS・ブラウザで修飾キーが異なる。[公式一覧](https://www.redmine.org/projects/redmine/wiki/RedmineKeyboardNavigation) | 操作への入口を短縮する。環境差も設計対象になる |
| Jira Cloud | `?`で一覧、`C`で作成、`O`で選択項目を開く、`J/K`で移動。ショートカットを無効化できる。[公式ガイド](https://support.atlassian.com/jira-software-cloud/docs/use-keyboard-shortcuts/) | 項目を次々に処理する導線と、発見・無効化の仕組みが参考になる |
| Kanboard | `n`で作成、`f`で検索、`b`でボード切替、`v`からのビュー切替、`?`で一覧、Ctrl/Cmd+Enterで送信。ページ依存。[公式一覧](https://docs.kanboard.org/v1/user/keyboard-shortcuts/) | 軽量な製品でも頻用操作への直接アクセスが備わる |
| Vikunja | Ctrl/Cmd+Kの横断検索、矢印・Enterで選択。検索から作成も可能。現在の文脈に応じたショートカット案内。[公式ガイド](https://vikunja.io/help/search-and-navigation/) | 検索と操作をまとめ、覚えなくても探せる入口が参考になる |
| Kanbalone main `92571d1` | `/`で検索、一覧の矢印移動とEnter、`N`で作成、Kanban/Listのチケットタイトルから`M`でレーン移動、対応ダイアログのCtrl/Cmd+Enter確定、表示対象のGroup検索。[実装と範囲](keyboard-workflow-plan.md) | 初回v1.0.0比較後に直接操作を追加した。発見性・実利用者の連続作業時間は未評価。専用ヘルプ一覧やショートカット無効化UIはない |

ショートカットの数を追いかけるのではなく、仕事を探してから記録・確認・次の仕事へ進むまでの手間を比べる。

## Kanbaloneの強みを支える証拠と限界

| 主張 | 実装・テスト・評価の根拠 | まだ言えないこと |
| --- | --- | --- |
| 外部の依頼と実装メモを分けて保持できる | [refresh時の本文保持テスト](../../../test/app-remote-ticket-api.test.ts)、[追跡付き作成のトランザクション](../../../src/db-modules/remote-workflows.ts) | 調査や報告の所要時間が他製品より短いとは未測定 |
| 人とAIが同じ作業記録を使える | [API](../../../src/routes/tickets.ts)、[配布スキル](../../../skills/kanbalone-api/SKILL.md)、[画面への更新通知](../../../public/app-board-events.js) | 次のAIが必ず理解できる、自律実行を管理する、全更新が競合に安全とは保証しない |
| 誤操作からの復帰を改善している | [日英の失敗・再試行・フォーカスレビュー](../../development/evidence/2026-11-22-ux1502-1505/review.md)、[Group競合テスト](../../../test/app-group-api.test.ts) | 実スクリーンリーダー、実利用者の理解・満足度、実外部サービス障害の全面検証ではない |
| 記録を保持して更新できる | [旧版移行・復元の自動検証](../../../scripts/verify-upgrade-restore.mjs)、[正式公開・ローカル移行記録](https://github.com/wamukat/kanbalone/pull/29#issuecomment-7072948161) | Exportが外部連携情報を含む完全バックアップである、自動バックアップがある、とは言わない |
| Simpleさを守っている | 単一Group、1階層親子、レーン由来の完了などの[モデル](../concepts.md)、[UI/UX評価方針](../../development/ui-ux-review.md) | 初期の43ユースケース評価はAIによる観察。人間の使いやすさや熟練者の速度を実証したものではない |

公開時は日英の主要操作、候補と公開イメージ、更新後のデータ保持を確認した。テスト成功は、利用者の生産性向上や競合優位の証明とは分ける。

## 伸ばす順番

1. **実装済みの連続操作を評価する。** 検索・作成・一覧の移動・コメント・レーン変更の[現在の導線](keyboard-workflow-plan.md)について、発見性・誤操作・復帰・所要時間を測る。
2. **受け入れ判断を早くする。** 変更内容・確認結果・未確認事項を見つけやすくする。現在あるTask・変更履歴・前回表示からの変更で、判断材料が揃うかを検証する。専用項目を増やす前に負担を測る。
3. **引き継ぎと報告を楽にする。** 別のAIや翌日の自分が再開できるか、必要な報告を選んで返しやすいかを検証する。

[初回の実機比較](product-hands-on-comparison.md)ではGUI/APIの往復とGroup相当の操作を確認した。続く比較実験では、同じ合成データで「課題を探す→調査メモを残す→受入待ちへ移す→確認して報告する」を実施する。製品ごとの得意な運用を尊重し、Kanbalone＋既存トラッカーとトラッカー単独の比較も行う。導入・二重管理・復帰の手間を含め、成功率、誤操作、所要時間、マウスへの持ち替え、再説明の回数を実測する。現時点の比較表に推定スコアは付けない。

## 改善への展開

[評価に基づく改善プラン](improvement-roadmap.md)に、実装済みの範囲、未測定の価値仮説、継続する評価を整理した。

## 外部資料の確認範囲（2026-11-28）

この更新では、上記リンクのうちキーボード比較4製品の公式案内、VikunjaのDocker／Pro／MCP、Atlassian Rovo MCP、KanBotsの導入・Local modeを再確認した。機能・権限・設定の主要な説明を照合したもので、全プラン、プラグイン、全OSでの実機確認ではない。導入表の所要負担は当時の観察として残し、新しい導入時間や性能値を推定しない。その他の初回仕様記録と[コミュニティ投稿の要約](product-community-research.md)は、全リンクの内容・修正状況を再検証したものではない。
