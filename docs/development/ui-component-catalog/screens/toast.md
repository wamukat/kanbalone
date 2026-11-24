# トースト通知

保存・削除等の短い処理結果とエラーを画面端に表示。操作対象の画面からも着目する。

各行はソースの要素です。CSS欄はセレクター別の宣言の抜粋です。継承や詳細度などを反映した描画値は観測ページにあります。状態・画面幅・配色の条件と残りの宣言は付属JSONの `styles` と [CSSルールJSON](rules.json) に記録しています。実測DOMで祖先を確認した参照には `matchBasis: recorded-markup` が付きます。文字指定を持たない要素の継承元は [基礎スタイル](../style-source.md) です。観測に対応しない行は観測ページでソースのみと表示します。

[画面の要素データ](toast.json) · [観測一覧](../observations/toast.md)

| 要素ID・観測 | 役割と状態 | セレクター・ソース | CSS宣言の抜粋 |
| --- | --- | --- | --- |
| [toast.notification](../observations/toast.md#toast.notification) | 通常の通知。メッセージのみで2.8秒後に消える。 | `#toast.toast[data-kind=info]`<br>[app-toast.js:3](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-toast.js#L3) | [toast.css:1](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/toast.css#L1) `.toast` `color: var(--on-accent)` `padding: 0.8rem 0.95rem, border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent), border-radius: var(--radius-surface), background: color-mix(in srgb, var(--accent) 96%, transparent), box-shadow: var(--shadow-popover), position: fixed`<br>[toast.css:15](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/toast.css#L15) `.toast[data-kind="error"]` `border-color: color-mix(in srgb, var(--danger) 46%, transparent), background: color-mix(in srgb, var(--danger) 96%, transparent)` |
| [toast.error](../observations/toast.md#toast.error) | エラー通知。エラーを翻訳し2.8秒後に消える。 | `#toast.toast[data-kind=error]`<br>[app-toast.js:4](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-toast.js#L4) | [toast.css:1](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/toast.css#L1) `.toast` `color: var(--on-accent)` `padding: 0.8rem 0.95rem, border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent), border-radius: var(--radius-surface), background: color-mix(in srgb, var(--accent) 96%, transparent), box-shadow: var(--shadow-popover), position: fixed`<br>[toast.css:15](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/toast.css#L15) `.toast[data-kind="error"]` `border-color: color-mix(in srgb, var(--danger) 46%, transparent), background: color-mix(in srgb, var(--danger) 96%, transparent)` |
