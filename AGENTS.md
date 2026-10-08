# Development workflow

- Start development work from `dev`; target `dev` with feature and fix PRs.
- Keep `main` for owner-approved squash merges from `dev`. Do not merge into
  `main`, deploy a site, publish an image or publish an npm package without approval.
- Use the exact Node/npm versions in `.nvmrc` and `package.json`, and install with
  `npm ci`. Run `npm run verify` before proposing integration.
- Preserve upstream history, MPL-2.0 notices and contributor credit. The runner is
  a separate dependency: do not vendor a runner source tree into this repository.
- Runner changes must identify an immutable source revision, regenerate its
  artifacts and verify the installed package and schema. See `runner-revision.json`.
- Regression tests must assert correct behavior. Do not reintroduce tests that
  pass because a known bug or secret leak still exists.
- Fixtures use local HTTP services and fake credentials. Do not use public test
  endpoints, production services or real credentials in the test suite.
- Keep commits meaningful and avoid assistant-generated attribution.
