# Development and verification

Work is integrated on `dev`. Feature/fix PRs target `dev`; promotion to `main` is
an owner-approved squash PR. The main branch is not an integration workspace.
The earlier [baseline](baseline.md) and [audit](security-baseline.md) are historical
records, not descriptions of the current dev behavior.

## Local checks

```sh
git checkout dev
nvm install
nvm use
npm install --global npm@11.9.0
npm ci --no-audit --no-fund
npm run verify
npm audit
```

The test suite exercises the compiled CLI and repeats the checks after extracting
the application tarball and installing its shipped shrinkwrap offline. The two
package builds must match byte-for-byte. Installed runner/plugin bytes, generated
schema, CLI and Action launcher are checked by the provenance manifest. Changed
runner or schema bytes must be rejected. Tests use local fixtures and fake secrets.

`Verify StepCI` runs on pushes and PRs for `dev` and `main`, and can be run manually
against dev. Its jobs cover CLI/package regressions, dependency audit, container
CLI and Action-entrypoint fixtures, and the actual reusable Docker Action. The
Action job requires a healthy deployment to pass and a deliberate 503 deployment
to fail. Documentation builds separately without deploying. The release workflow
requires the same verification workflow before its publication job can run;
publication itself is not exercised by dev CI.

## Runner identity and contributor credit

The runner is the immutable source archive at
`e8a93ef894c079b19ccd87ed7cdcfcf87f79e7cf`, from
[Matthew J. Martin (matmar10)'s PR132](https://github.com/stepci/runner/pull/132).
Its source change is `ca89c2088e0710362364817af41dc4a1facdb6f3`; its manifest
version remains 2.0.7. This is **not** the npm 2.0.7 release and not an assertion
that upstream has merged the PR. The CLI lock records the archive's integrity,
and `runner-revision.json` records the source identity and attribution.

Each build copies that installed source into a disposable directory, installs
its own locked build dependencies with lifecycle scripts disabled, recompiles
all 30 JS/declaration artifacts and requires exact agreement with the archive's
artifacts. The rebuilt files are used by the CLI. Schema generation then reads
the installed runner declarations. Rebuild evidence includes the source lock
hash and compiler version. No second runner source tree is vendored here.

This pinned contributor revision is a development bridge. Prefer a verified
upstream release when available; use a small history-preserving companion fork
when further runner source changes or durable release ownership are needed.
Creating that fork and publishing a package are separate from this integration.

## Correct failure behavior

Missing JSONPath results and invalid JSONPath/regex expressions fail the affected
check without replacing unrelated passing results. HTTP failures/timeouts remain
exit 5. Invalid YAML, invalid outer workflow structure and malformed CLI inputs
return exit 1 with a useful diagnostic. YAML errors show a location instead of a
source excerpt that could contain credentials. Success remains exit 0.

Matcher compatibility is explicit:

| Matcher | Missing/null/unsupported membership value | Empty array |
| --- | --- | --- |
| `in` | false | false |
| `nin` | true | true |
| `match` | false for missing/null; existing coercion for other values | existing regex coercion |

These are PR132's semantics. `nin` describes absence; it does not require a field
to exist. Add `isDefined: true` and an appropriate type assertion when existence
and type are requirements. `ne` retains strict inequality; use `eq` for deep
structural equality. The tests cover these decisions rather than silently
changing their meaning. No generic sandbox for untrusted workflow code is implied.

## Credentials and telemetry

The inherited telemetry client, persistent UID and PostHog dependencies are
removed. The default CLI is tested without the old disable flag and may not make
any non-fixture connection or create an analytics identity.

Use `STEPCI_SECRETS` as a JSON object from your CI secret store. Values must be
strings. Existing `--secret key=value` inputs override matching environment
secrets; they remain supported but put values in process arguments. The Action
passes its secret input through the environment to avoid that exposure.

Known secret values and sensitive authentication fields are redacted before
rendering, including encoded URL/JSON/base64 forms, normal/verbose diagnostics
and parsing errors. Structured output copies are redacted without altering values
used by checks. No report export was added; a regression exercises JSON
serialization of that shared redactor for future consumers. Raw workflow files,
the environment and server logs are not rewritten by this boundary.

Action inputs accept JSON objects/string arrays and legacy quoted `key=value`
entries. The launcher never evaluates a shell command. Spaces, quotes, command
substitution syntax and metacharacters remain literal values. Tests cover exits
0/1/5, concurrency forwarding, SIGTERM/SIGINT forwarding and child cleanup.

## Dependency and branch integration

The refreshed application lock reports **zero npm audit findings** in the
[recorded audit](security-dev.json). CI repeats the live audit; this is not a
guarantee that future advisories will stay empty or that every defect is known.
The runner's isolated historical compiler lock is separate from the application's
runtime/development graph; it is retained for artifact reproduction and is not
claimed to have a clean audit. Its dependencies are not copied into the runtime.

| Reviewed work | Integration on dev |
| --- | --- |
| Axios/PostHog branch `71cbf6e` / upstream PR184 | Superseded by removing telemetry and its entire Axios chain. |
| Follow-redirects branch `ad6afbb` / upstream PR197 | Superseded by removing its telemetry dependency path. |
| Vite branch `2bef27d` / upstream PR200 | Refreshed to VitePress 1.6.4 with Vite 6.4.4, rather than the vulnerable historical Vite 4.5.2. |
| RemiBardon's CLI PR247 | Its security-refresh work informed this update; current pins and fixtures replace its stale lock/schema results. |
| Runner PR98 (Got 12) | Not incorporated: it fails compilation and is unnecessary for this lock's advisory remediation. A future HTTP-client migration needs its own compatibility work. |
| Runner PR99 / CLI PR258 | Reviewed previously; module-layout and multi-file feature work remain separate. |

The three old branch tips are retained as history. Their obsolete dependency
versions are not merged. The tested remediation of their dependency concerns is
included in dev's refreshed graph.

Reviewed overrides cover parse-duration 2.1.9, Faker 10.6.0, JSONPath 10.4.0,
basic-ftp 6.2.2, Vite 6.4.4 and replacement of deprecated json-schema-ref-parser
with the maintained 11.7.2 package. Regressions exercise duration parsing, JSONPath,
OpenAPI generation, schema-faker reference resolution and Faker templates.
Legacy Faker module names removed upstream, such as `name.firstName`, need their
modern equivalents (`person.firstName`). General workflow syntax is retained.

## Containers and release evidence

Both Dockerfile paths use one definition (`Dockerfile.action` is a symlink).
The Node 24.21.0 base image is pinned by digest. Builder installs use locked
inputs; the final image installs the same shrinkwrapped application package and
contains no builder npm/cache directory. CI checks the installed provenance and
runs the HTTP/JSON regressions through both entrypoints.

For an explicit build revision:

```sh
docker build --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" -t stepci:local .
docker run --rm --entrypoint node stepci:local scripts/provenance.cjs verify .
```

GitHub's automatic Docker Action build does not supply custom build arguments or
Git metadata. In that path the manifest explicitly records a null CLI commit and
the complete source file hashes; the runner commit/integrity remains mandatory.
Approved release builds pass the exact revision explicitly. No unknown commit is
represented as verified.

CI builds the image twice without build cache and records image IDs, layer IDs,
application content/modes and timestamp differences in `image-comparison.json`.
Application bytes must agree. Different image IDs are reported, not called
bit-for-bit reproducible; inspect timestamp/creation metadata before release.

Before approving a squash/release, review the exact-head CI evidence, remaining
source-ownership/compiler-lock decisions, matcher semantics and migration notes.
Publication credentials, signed release provenance, multi-architecture execution
and a staging pilot still require their own validation. No production service,
site deployment or package publication is part of these development tests.
