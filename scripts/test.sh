#!/usr/bin/env bash
# Équivalent Linux / Raspberry Pi / CI de scripts/test.ps1 (outils locaux : python3.12, node 22).
#   ./scripts/test.sh          backend + frontend
#   ./scripts/test.sh --e2e    + Playwright contre http://localhost:8080 (E2E_BASE_URL pour changer)
set -euo pipefail
cd "$(dirname "$0")/.."
failed=()

echo "=== Backend : ruff + pytest ==="
(
  cd backend
  [[ -d .venv ]] || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
  .venv/bin/ruff check app tests
  .venv/bin/python -m pytest
) || failed+=(backend)

echo "=== Frontend : typecheck + Vitest ==="
(
  cd frontend
  [[ -d node_modules ]] || npm ci --no-audit --no-fund
  npm run typecheck
  npm test
) || failed+=(frontend)

if [[ "${1:-}" == "--e2e" ]]; then
  echo "=== End-to-end : Playwright ==="
  (cd frontend && npx playwright install chromium >/dev/null && npx playwright test) || failed+=(e2e)
fi

if ((${#failed[@]})); then
  echo "ÉCHEC : ${failed[*]}" >&2
  exit 1
fi
echo "Tous les tests sont passés."
