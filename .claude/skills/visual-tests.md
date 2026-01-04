---
description: Run visual regression tests for CSS styling
---

Run visual comparison tests for the extension popup and options pages.

## Usage

- `/visual-tests` - Compare current screenshots against baselines
- `/visual-tests --update` - Update baseline screenshots after intentional CSS changes

## Steps

1. Build the Chrome extension first (if not already built):
   ```bash
   npm run build:chrome
   ```

2. Run visual tests (WITHOUT --update):
   ```bash
   npm run test:visual
   ```

3. On failure, ALWAYS review the diff images in `test-results/`:
   - `*-actual.png` - What the test captured
   - `*-expected.png` - The baseline
   - `*-diff.png` - Visual diff highlighting changes

   Ask: Are these differences bugs to fix, or intentional changes?

4. If differences are BUGS: Fix the code, then re-run tests (step 2)
   If differences are INTENTIONAL: Only then update baselines:
   ```bash
   npm run test:visual:update
   ```

IMPORTANT: NEVER run `--update` without first reviewing diff images and
confirming the current UI is correct. Updating baselines prematurely defeats
the purpose of visual regression testing.

## Test Coverage

- Popup with issues (open and closed states)
- Popup empty state
- Popup import section
- Options page default state
- Options page with token configured

## Baseline Location

Baseline screenshots are stored in `tests/screenshots/`.
