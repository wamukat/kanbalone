# Kanbalone Design System

Kanbalone の UI は、Plane.so や Linear のような精度の高いプロダクト UI を参考にしながら、ローカルファーストの軽さと個人開発者向けの単純さを優先します。

## Design Intent

- 対象ユーザ: 1 人で開発し、AI と一緒にタスクを整理する開発者。
- 主要行動: ボードを開く、チケットを作る、状態を変える、関係やコメントを確認する。
- 感触: Plane-style refined minimal with soft depth。
- 優先順位: 視認性、速度、密度、迷わない操作、静かな質感。

Kanbalone は派手な SaaS ダッシュボードではなく、毎日開き続けても疲れない作業面です。装飾は控えめにし、境界・余白・タイポグラフィで品質を出します。

## Color Palette

### Light Mode

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Canvas | `--surface-canvas` | `#f7f8f7` | App background |
| Surface | `--surface-1` | `#ffffff` | Dialogs, cards, controls |
| Raised surface | `--surface-2` | `#fbfcfb` | Hovered cards, popovers |
| Inset surface | `--surface-inset` | `#f1f4f2` | Inputs, recessed controls |
| Text | `--text-strong` | `#15201c` | Main text |
| Muted text | `--text-muted` | `#66736d` | Secondary labels |
| Subtle text | `--text-subtle` | `#8a9690` | Metadata |
| Border | `--border-soft` | `rgba(21, 32, 28, 0.10)` | Standard borders |
| Strong border | `--border-strong` | `rgba(21, 32, 28, 0.18)` | Focus and active states |
| Accent | `--accent` | `#1f6f5f` | Primary actions, selected state |
| Accent hover | `--accent-hover` | `#18594d` | Primary hover |
| Accent soft | `--accent-soft` | `#dceee9` | Pills, active filters |
| Danger | `--danger` | `#c43d3d` | Destructive foreground |
| Danger soft | `--danger-soft` | `#fae7e7` | Destructive confirmation |
| Success | `--success` | `#257a57` | Saved state, positive toast |
| Warning | `--warning` | `#a86616` | Risk or attention |

### Dark Mode

Dark mode は `prefers-color-scheme: dark` に連動して自動適用します。アプリ内の Light / Dark 切り替えボタンは持たず、OS / ブラウザの外観設定に従います。

配色は濃い青や紫に寄せず、墨色に近いニュートラルと teal を使います。

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--surface-canvas` | `#111613` |
| Surface | `--surface-1` | `#171d19` |
| Raised surface | `--surface-2` | `#1d2520` |
| Inset surface | `--surface-inset` | `#101511` |
| Text | `--text-strong` | `#eef4f1` |
| Muted text | `--text-muted` | `#a7b3ad` |
| Subtle text | `--text-subtle` | `#7e8a84` |
| Border | `--border-soft` | `rgba(238, 244, 241, 0.10)` |
| Strong border | `--border-strong` | `rgba(238, 244, 241, 0.20)` |
| Accent | `--accent` | `#54b89f` |
| Accent hover | `--accent-hover` | `#71c9b4` |
| Accent soft | `rgba(84, 184, 159, 0.16)` |

## Typography

推奨 font stack:

```css
font-family: Inter, "SF Pro Text", "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

方針:

- UI 全体は 14px を基準にする。
- 日本語が混じっても読みやすいように `Noto Sans JP` を fallback に入れる。
- 見出しは太くしすぎず、`600` を上限の基本にする。
- ラベルは小さくしすぎない。フォームラベルは 12-13px、本文は 14px。
- letter-spacing は原則 `0`。大文字ラベルなど限定的に `0.01em` まで。

Scale:

| Role | Size | Weight |
| --- | --- | --- |
| App title | 18px | 650 |
| Section title | 15px | 650 |
| Card title | 14px | 600 |
| Body | 14px | 400 |
| Label | 12px | 600 |
| Metadata | 12px | 400 |
| Tiny counter | 11px | 600 |

## Spacing, Radius, Shadows

Spacing は 4px ベースで設計します。

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | 4px | Icon/text gaps |
| `--space-2` | 8px | Compact controls |
| `--space-3` | 12px | Form rows, card inner gaps |
| `--space-4` | 16px | Card padding, sidebar groups |
| `--space-5` | 20px | Dialog sections |
| `--space-6` | 24px | Main content spacing |

Radius:

- Small controls: 6px
- Cards and dialogs: 8px
- Pills and tags: 6px
- Buttons: 6px

Kanbalone ではカードとボタンの radius は 8px 以下にします。丸みは控えめにし、Plane/Linear 系の精密さを保ちます。

Shadow:

```css
--shadow-card: 0 1px 2px rgba(21, 32, 28, 0.06);
--shadow-popover: 0 12px 32px rgba(21, 32, 28, 0.16);
--shadow-dialog: 0 24px 64px rgba(21, 32, 28, 0.22);
```

基本は border で構造を作り、shadow は浮いている要素だけに使います。

## Components

### Cards

- 背景は `--surface-1`。
- 枠線は `--border-soft`。
- hover で `--surface-2`、`--border-strong`、わずかな shadow。
- Resolved/Archived の状態は小さなアイコンで示し、文字情報を増やしすぎない。
- カード内カード、大きな色面、強すぎる影、長いテキストによる幅崩れを避ける。

### Board And Columns

- レーンは薄い境界で分ける。
- レーン背景は Canvas からわずかに持ち上げる程度にする。
- レーン見出しはコンパクトにし、チケット数を横に置く。
- 空レーンの表示は控えめにし、不要な空状態メッセージを増やさない。
- 横スクロールは kanban 領域に限定し、画面全体に二重スクロールを出さない。

### Sidebar

- 背景は canvas と同系色にする。
- 境界は右 border だけで十分。
- Board/Tag は密度を保ちつつ、選択状態を明確にする。
- アイコンは Lucide-style の 16px を基本にする。
- 低頻度操作は常時目立たせない。

### Dialogs

- Overlay は維持する。
- Dialog 下部には viewport との余白を残す。
- 外側クリックと Escape で閉じる。
- コメント一覧は内部スクロールさせず全件表示する。
- Save feedback は操作したボタンの近くに表示する。
- Ticket created などユーザが文脈を失ってもよい通知は toast にする。

### Buttons And Actions

- Primary: Create, Save など確定操作。背景 `--accent`、文字 `--on-accent`。
- Secondary: 標準操作。背景 `--surface-1`、border `--border-soft`。
- Danger: Delete は foreground を `--danger`。削除確認の最終 Delete は背景 `--danger`、前景 `--on-accent`。
- Icon button: 16px icon、通常は透明背景、hover 時だけ薄い背景。
- 常用しない編集/削除操作は、1 action 後に露出する progressive disclosure を基本にする。

### Tags

- 背景色ありの場合、背景色に対して読みやすい前景色を自動選択する。
- 色なしの場合、塗りではなく枠線で表現する。
- 長いタグは表示長を制限し、完全な値は tooltip で補う。
- Tag chip の radius は 6px。
- 編集 affordance は badge 内に収める。

## Toast And Feedback

Toast は成功/失敗の結果通知に限定します。

Toast の色は `--accent` / `--danger` を `color-mix()` で使い、ローカルな固定色を増やしません。

Feedback placement:

- Ticket save: editor header actions の近く。
- Comment add/edit/delete: comment action row の近く。
- Ticket created: toast。

## Motion

- Duration: 120-180ms。
- Easing: `cubic-bezier(0.2, 0, 0, 1)`。
- Sidebar settings や progressive actions は opacity + height/transform の小さな変化。
- Board/card の hover は位置を大きく動かさない。
- 初回操作の案内など、ユーザの注意を誘導する nudge だけは `--motion-attention` / `--ease-attention` を使える。常時の装飾には使わず、`prefers-reduced-motion` では停止する。

## Accessibility

- Focus ring は `--accent` を使う。
- 色だけで状態を伝えない。アイコン、テキスト、tooltip を併用する。
- タグやボタンは最小 32px 程度のクリック領域を確保する。
- コントラスト不足になりやすいタグ色は前景色自動選択で補正する。

## Implementation Priority

1. CSS custom properties を上記 token に寄せる。
2. Button、input、tag、ticket card、dialog、toast を token ベースにする。
3. Kanban column と sidebar の surface/border を整理する。
4. E2E と agent-browser で、kanban/list/dialog/tag/empty state を確認する。
5. Dark mode は `prefers-color-scheme` 連動を維持し、Light / Dark 両方で token から外れた固定色を増やさない。
