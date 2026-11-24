# 基礎スタイルの宣言一覧

このページは現状の宣言を記録します。共通化後の規約ではありません。実際の表示値は、各画面のcomputed styleと照合します。要素に固有のルールや後から読み込まれるCSSで上書きされることがあります。

基準: `2ff8489d889706a6dc6392fd28aeff073e0b515c`。機械可読の元一覧は [style-source.json](style-source.json) です。

## トークン

`base` は通常の `:root`、`dark override` は `prefers-color-scheme: dark` による上書きです。

| 変数 | 範囲 | 宣言値 | ソース行 |
| --- | --- | --- | --- |
| `--surface-canvas` | base | `#f7f8f7` | tokens.css:2 |
| `--surface-1` | base | `#ffffff` | tokens.css:3 |
| `--surface-2` | base | `#fbfcfb` | tokens.css:4 |
| `--surface-inset` | base | `#f1f4f2` | tokens.css:5 |
| `--text-strong` | base | `#15201c` | tokens.css:6 |
| `--text-muted` | base | `#66736d` | tokens.css:7 |
| `--text-subtle` | base | `#8a9690` | tokens.css:8 |
| `--border-soft` | base | `rgba(21, 32, 28, 0.1)` | tokens.css:9 |
| `--border-strong` | base | `rgba(21, 32, 28, 0.18)` | tokens.css:10 |
| `--accent` | base | `#1f6f5f` | tokens.css:11 |
| `--accent-hover` | base | `#18594d` | tokens.css:12 |
| `--on-accent` | base | `#ffffff` | tokens.css:13 |
| `--control-knob` | base | `#ffffff` | tokens.css:14 |
| `--accent-soft` | base | `#dceee9` | tokens.css:15 |
| `--danger` | base | `#c43d3d` | tokens.css:16 |
| `--danger-soft` | base | `#fae7e7` | tokens.css:17 |
| `--success` | base | `#257a57` | tokens.css:18 |
| `--warning` | base | `#a86616` | tokens.css:19 |
| `--space-1` | base | `4px` | tokens.css:20 |
| `--space-2` | base | `8px` | tokens.css:21 |
| `--space-3` | base | `12px` | tokens.css:22 |
| `--space-4` | base | `16px` | tokens.css:23 |
| `--space-5` | base | `20px` | tokens.css:24 |
| `--space-6` | base | `24px` | tokens.css:25 |
| `--font-family-ui` | base | `Inter, "SF Pro Text", "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | tokens.css:26 |
| `--font-size-app-title` | base | `18px` | tokens.css:35 |
| `--font-size-section-title` | base | `15px` | tokens.css:36 |
| `--font-size-body` | base | `14px` | tokens.css:37 |
| `--font-size-card-title` | base | `14px` | tokens.css:38 |
| `--font-size-label` | base | `12px` | tokens.css:39 |
| `--font-size-meta` | base | `12px` | tokens.css:40 |
| `--font-size-tiny` | base | `11px` | tokens.css:41 |
| `--font-size-control` | base | `14px` | tokens.css:42 |
| `--font-weight-regular` | base | `400` | tokens.css:43 |
| `--font-weight-medium` | base | `500` | tokens.css:44 |
| `--font-weight-semibold` | base | `600` | tokens.css:45 |
| `--font-weight-strong` | base | `650` | tokens.css:46 |
| `--line-height-body` | base | `1.45` | tokens.css:47 |
| `--line-height-tight` | base | `1.25` | tokens.css:48 |
| `--line-height-control` | base | `1.3` | tokens.css:49 |
| `--icon-size-default` | base | `16px` | tokens.css:50 |
| `--icon-size-button` | base | `16px` | tokens.css:51 |
| `--icon-size-small` | base | `12px` | tokens.css:52 |
| `--icon-size-meta` | base | `13px` | tokens.css:53 |
| `--icon-size-empty` | base | `19px` | tokens.css:54 |
| `--control-size-icon` | base | `32px` | tokens.css:55 |
| `--radius-control` | base | `6px` | tokens.css:56 |
| `--radius-surface` | base | `8px` | tokens.css:57 |
| `--radius-pill` | base | `999px` | tokens.css:58 |
| `--motion-fast` | base | `140ms` | tokens.css:59 |
| `--motion-normal` | base | `150ms` | tokens.css:60 |
| `--motion-slow` | base | `180ms` | tokens.css:61 |
| `--motion-attention` | base | `1800ms` | tokens.css:62 |
| `--ease-standard` | base | `cubic-bezier(0.2, 0, 0, 1)` | tokens.css:63 |
| `--ease-attention` | base | `ease-in-out` | tokens.css:64 |
| `--shadow-card` | base | `0 1px 2px rgba(21, 32, 28, 0.06)` | tokens.css:65 |
| `--shadow-card-hover` | base | `0 6px 18px rgba(21, 32, 28, 0.08)` | tokens.css:66 |
| `--shadow-popover` | base | `0 12px 32px rgba(21, 32, 28, 0.16)` | tokens.css:67 |
| `--shadow-dialog` | base | `0 24px 64px rgba(21, 32, 28, 0.22)` | tokens.css:68 |
| `--overlay-bg` | base | `rgba(28, 28, 23, 0.3)` | tokens.css:69 |
| `--bg` | base | `var(--surface-canvas)` | tokens.css:70 |
| `--panel` | base | `var(--surface-1)` | tokens.css:71 |
| `--panel-strong` | base | `var(--surface-2)` | tokens.css:72 |
| `--resolved-row-bg` | base | `color-mix(in srgb, var(--text-muted) 4%, transparent)` | tokens.css:73 |
| `--line` | base | `var(--border-soft)` | tokens.css:74 |
| `--text` | base | `var(--text-strong)` | tokens.css:75 |
| `--muted` | base | `var(--text-muted)` | tokens.css:76 |
| `--control-bg` | base | `color-mix(in srgb, var(--surface-1) 92%, transparent)` | tokens.css:77 |
| `--control-border` | base | `var(--line)` | tokens.css:78 |
| `--control-hover-border` | base | `color-mix( in srgb, var(--text-muted) 28%, transparent )` | tokens.css:79 |
| `--control-focus-border` | base | `color-mix(in srgb, var(--accent) 42%, transparent)` | tokens.css:84 |
| `--control-focus-ring` | base | `0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent)` | tokens.css:85 |
| `--active-filter-ring` | base | `0 0 0 2px color-mix(in srgb, var(--accent) 8%, transparent)` | tokens.css:87 |
| `--drag-ring` | base | `0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent)` | tokens.css:89 |
| `--attention-ring` | base | `var(--control-focus-ring)` | tokens.css:90 |
| `--attention-ring-strong` | base | `0 0 0 5px color-mix(in srgb, var(--accent) 16%, transparent)` | tokens.css:91 |
| `--surface-canvas` | dark override | `#111613` | tokens.css:98 |
| `--surface-1` | dark override | `#171d19` | tokens.css:99 |
| `--surface-2` | dark override | `#1d2520` | tokens.css:100 |
| `--surface-inset` | dark override | `#101511` | tokens.css:101 |
| `--text-strong` | dark override | `#eef4f1` | tokens.css:102 |
| `--text-muted` | dark override | `#a7b3ad` | tokens.css:103 |
| `--text-subtle` | dark override | `#7e8a84` | tokens.css:104 |
| `--border-soft` | dark override | `rgba(238, 244, 241, 0.1)` | tokens.css:105 |
| `--border-strong` | dark override | `rgba(238, 244, 241, 0.2)` | tokens.css:106 |
| `--accent` | dark override | `#54b89f` | tokens.css:107 |
| `--accent-hover` | dark override | `#71c9b4` | tokens.css:108 |
| `--on-accent` | dark override | `#071310` | tokens.css:109 |
| `--control-knob` | dark override | `#ffffff` | tokens.css:110 |
| `--accent-soft` | dark override | `rgba(84, 184, 159, 0.16)` | tokens.css:111 |
| `--danger` | dark override | `#ef7772` | tokens.css:112 |
| `--danger-soft` | dark override | `rgba(239, 119, 114, 0.16)` | tokens.css:113 |
| `--success` | dark override | `#54b89f` | tokens.css:114 |
| `--warning` | dark override | `#d5a451` | tokens.css:115 |
| `--shadow-card` | dark override | `0 1px 2px rgba(0, 0, 0, 0.22)` | tokens.css:116 |
| `--shadow-card-hover` | dark override | `0 10px 24px rgba(0, 0, 0, 0.28)` | tokens.css:117 |
| `--shadow-popover` | dark override | `0 16px 36px rgba(0, 0, 0, 0.34)` | tokens.css:118 |
| `--shadow-dialog` | dark override | `0 28px 72px rgba(0, 0, 0, 0.46)` | tokens.css:119 |
| `--overlay-bg` | dark override | `rgba(0, 0, 0, 0.54)` | tokens.css:120 |

## CSS読み込み順

`public/styles.css` の順序です。値が同じに見えても、各画面のCSSで個別に設定されている場合は画面別一覧に記録します。

1. `./styles/tokens.css`
2. `./styles/base.css`
3. `./styles/scrollbars.css`
4. `./styles/components.css`
5. `./styles/forms.css`
6. `./styles/toggles.css`
7. `./styles/app-shell.css`
8. `./styles/sidebar-layout.css`
9. `./styles/sidebar-boards.css`
10. `./styles/sidebar-tags.css`
11. `./styles/sidebar-board-settings.css`
12. `./styles/toolbar-filters.css`
13. `./styles/filter-menus.css`
14. `./styles/kanban-board.css`
15. `./styles/list-board.css`
16. `./styles/list-actions.css`
17. `./styles/list-table.css`
18. `./styles/lanes.css`
19. `./styles/ticket-cards.css`
20. `./styles/ticket-priority.css`
21. `./styles/ticket-status-icons.css`
22. `./styles/kanban-card-icon-masks.css`
23. `./styles/tags.css`
24. `./styles/content-markdown.css`
25. `./styles/quick-add.css`
26. `./styles/empty-state.css`
27. `./styles/dialog-shell.css`
28. `./styles/tag-color-dialog.css`
29. `./styles/tag-manager.css`
30. `./styles/editor-fields.css`
31. `./styles/ticket-tag-input.css`
32. `./styles/tag-picker-options.css`
33. `./styles/ticket-picker-meta.css`
34. `./styles/ticket-detail.css`
35. `./styles/ticket-editor.css`
36. `./styles/comments-activity.css`
37. `./styles/toast.css`
38. `./styles/ticket-refs.css`
39. `./styles/footer.css`
40. `./styles/responsive.css`
41. `./styles/dark-mode.css`
42. `./styles/groups.css`
43. `./styles/group-row-icon-masks.css`
44. `./styles/custom-views.css`
