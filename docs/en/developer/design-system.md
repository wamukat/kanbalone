# Kanbalone Design System

Kanbalone should feel as precise and polished as products like Plane.so and Linear, while keeping the speed and simplicity expected from a local-first tool for solo developers.

## Design Intent

- User: a solo developer organizing work with an AI collaborator.
- Core actions: open a board, create a ticket, change state, review relationships, add comments.
- Feeling: Plane-style refined minimal with soft depth.
- Priorities: readability, speed, density, low-friction operation, quiet polish.

Kanbalone is not a loud SaaS dashboard. It is a work surface that should stay comfortable when it is open all day. The design should rely on spacing, typography, borders, and subtle layering instead of decoration.

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

Dark mode is applied automatically through `prefers-color-scheme: dark`. Kanbalone does not provide an in-app Light / Dark toggle; it follows the OS or browser appearance setting.

Keep the palette neutral and ink-like instead of leaning into dark blue or purple.

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

Recommended font stack:

```css
font-family: Inter, "SF Pro Text", "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Policy:

- Use 14px as the main UI baseline.
- Include `Noto Sans JP` so mixed Japanese and English remains readable.
- Prefer `600` for headings; avoid unnecessarily heavy text.
- Keep form labels readable at 12-13px.
- Keep letter spacing at `0` by default. Use up to `0.01em` only for constrained labels.

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

Use a 4px spacing base.

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

Keep card and button radii at 8px or less. This preserves the precise Plane/Linear-like feel.

Shadow:

```css
--shadow-card: 0 1px 2px rgba(21, 32, 28, 0.06);
--shadow-popover: 0 12px 32px rgba(21, 32, 28, 0.16);
--shadow-dialog: 0 24px 64px rgba(21, 32, 28, 0.22);
```

Use borders for structure. Use shadows only for genuinely elevated elements.

## Components

### Cards

- Use `--surface-1` for the background.
- Use `--border-soft` for the border.
- On hover, use `--surface-2`, `--border-strong`, and a slightly stronger shadow.
- Show Resolved/Archived states with small icons instead of adding noisy labels.
- Avoid cards inside cards, large color blocks, heavy shadows, and text that breaks card width.

### Board And Columns

- Separate lanes with quiet borders.
- Lift lane backgrounds only slightly from the canvas.
- Keep lane headers compact and place ticket counts next to titles.
- Keep empty lane states subtle. Do not add unnecessary empty-state text.
- Keep horizontal scrolling scoped to the kanban area. Avoid page-level double horizontal scrollbars.

### Sidebar

- Keep the sidebar background close to the canvas.
- Use only a subtle right border for separation.
- Make selected boards and tags clear while preserving density.
- Use Lucide-style 16px icons by default.
- Keep low-frequency actions visually quiet.

### Dialogs

- Keep the overlay.
- Leave visible space below the dialog when it is taller than the viewport.
- Support outside click and Escape to close.
- Show all comments without an internal comments scrollbar.
- Place save feedback near the action that produced it.
- Use toast for notifications where the user can safely lose context, such as `Ticket created`.

### Buttons And Actions

- Primary: Create and Save actions. Background `--accent`, foreground `--on-accent`.
- Secondary: Standard actions. Background `--surface-1`, border `--border-soft`.
- Danger: Delete uses `--danger` as foreground. Final Delete in confirmation dialogs uses `--danger` as background and `--on-accent` as foreground.
- Icon button: 16px icon, transparent by default, quiet background on hover.
- Put infrequent edit/delete actions behind progressive disclosure.

### Tags

- Automatically choose a readable foreground color for colored tag backgrounds.
- For no-color tags, use an outline instead of a fill.
- Truncate long tags and expose the full value with a tooltip.
- Use 6px radius for tag chips.
- Keep edit affordances inside the badge.

## Toast And Feedback

Use toast only for result notifications.

Toast colors should use `--accent` / `--danger` through `color-mix()` instead of adding local fixed colors.

Feedback placement:

- Ticket save: near editor header actions.
- Comment add/edit/delete: near the comment action row.
- Ticket created: toast.

## Motion

- Duration: 120-180ms.
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Sidebar settings and progressive actions use small opacity plus height/transform changes.
- Board/card hover states should not shift layout.
- First-run guidance and other intentional nudges may use `--motion-attention` / `--ease-attention`. Do not use them for decorative ambient motion, and stop them under `prefers-reduced-motion`.

## Accessibility

- Use `--accent` for focus rings.
- Do not communicate state by color alone. Combine icon, text, and tooltip where needed.
- Keep interactive targets around 32px or larger.
- Use automatic tag foreground selection to avoid poor contrast.

## Implementation Priority

1. Align CSS custom properties with these tokens.
2. Move buttons, inputs, tags, ticket cards, dialogs, and toasts to token-based styling.
3. Normalize kanban column and sidebar surface/border treatment.
4. Verify kanban, list, dialogs, tags, and empty states with E2E and agent-browser.
5. Keep dark mode tied to `prefers-color-scheme` and avoid fixed colors outside the token system in both Light and Dark.
