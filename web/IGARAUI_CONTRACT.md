# IgaraUI Contract

`Amplex` must treat `IgaraUI` as the shared UI/UX building kit.

## Mandatory Rules

- Use `igara` tokens defined in `web/src/index.css`.
- Build and compose with DaisyUI + Tailwind utilities.
- Reuse shared UI primitives before introducing new visual variants.
- Keep product customizations in behavior/content, not in core visual language.

## Forbidden Patterns

- Inline visual styles in JSX (`style={{ ... }}`), except explicit technical exceptions.
- Hex color hardcoding in TSX/JSX.
- Alternative styling systems that bypass IgaraUI tokens.

## Review Checklist (required in PRs)

1. Change reuses IgaraUI patterns/components.
2. No new inline style or hardcoded hex was added.
3. All core visual decisions use tokenized classes.
4. States and spacing remain consistent with Hub/Entity.
