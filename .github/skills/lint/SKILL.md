---
name: lint
description: "Run Amplex lint suite: black (Python formatting), ruff (Python lint), eslint (TypeScript), tsc (type check). Use when: verifying code quality, checking for errors, running lint, before committing."
---

# Amplex Lint Suite

## When to Use
- After code changes, before committing
- To verify code quality across backend and frontend
- When asked to check for lint or type errors

## Backend (Python)

Run from repo root:

```bash
black --check api/ amplex/ tests/              # Format check
ruff check api/ amplex/ tests/ --config ruff.toml  # Lint
python -m pytest tests/ --tb=short -v          # Tests
```

## Frontend (TypeScript)

Run from `frontend/`:

```bash
npx eslint .                           # Lint
npx tsc --noEmit                       # Type check
```

## Procedure

1. Run backend format check (`black --check`)
2. Run backend lint (`ruff check`)
3. Run backend tests (`pytest`)
4. Run frontend lint (`eslint`)
5. Run frontend type check (`tsc --noEmit`)
6. Report all errors found
7. Fix any issues and re-run until clean
