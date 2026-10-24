<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Layout Preferences

- Exception: preserve the English vocabulary interactive practice's original
  desktop layout, with questions on the left and a 340px settings sidebar on
  the right (`lg` and above). Smaller viewports keep the stacked layout. The
  user explicitly requested this restoration; do not apply the general
  single-column preference below to this practice workspace.
- Always stack learning-content lists, lesson/article cards, reading methods,
  and primary study content in one vertical column on every viewport size.
- Do not introduce side-by-side content cards or left/right learning panes,
  including on wide desktop screens. Put study navigation above the content.
- Compact controls such as tabs, filters, action buttons, and question-number
  navigation may share a row; they must not become separate content columns.
