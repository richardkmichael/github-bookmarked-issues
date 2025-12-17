# Build Instructions for Firefox AMO Reviewers

This extension uses a simple build process with one npm dependency.

## Prerequisites

- Node.js 18+
- npm

## Build Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/github-bookmarked-issues.git
   cd github-bookmarked-issues/development
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build:firefox
   ```

## Output

The built Firefox extension will be located at:
- `build/firefox/github-bookmarked-issues-{version}.xpi`

## Dependency Information

The extension uses one external dependency:

- **@github/relative-time-element** (GitHub's web component)
  - npm package: https://www.npmjs.com/package/@github/relative-time-element
  - Source: https://github.com/github/relative-time-element
  - Version: 5.0.0 (pinned in package.json)
  - Built file: Copied from `node_modules/@github/relative-time-element/dist/index.js`
  - License: MIT
  - Purpose: Display human-friendly relative timestamps ("2 weeks ago")

The dependency is installed via npm and the built file is copied during the build process.
