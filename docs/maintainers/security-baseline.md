# Dependency exposure baseline

Reviewed 2026-10-07 against the original locked dependency versions. The baseline
PR changes pin/lock metadata but does not update any dependency version.
`npm audit --json` returned **33 affected package entries**: 6 critical, 19 high,
7 moderate, 1 low. `npm audit --omit=dev --json` returned **22**: 6 critical,
10 high, 6 moderate. Both commands exit 1. Counts include propagated dependency
findings and are not counts of independently exploitable vulnerabilities.
Live registry advisories change; the checked-in [inventory](audit-baseline.json)
records package versions, advisory URLs and the distinction between runtime and
development findings. This is an exposure review, not a penetration test.

## Exposure and remediation order

| Dependency / path | Reachability in this product | Disposition |
| --- | --- | --- |
| runner → jsonpath-plus 7.2.0 | Evaluates workflow JSONPath against service response JSON; runner does not disable script evaluation. Code-execution advisories make untrusted expressions especially dangerous. Templating can also bring captured data into workflow expressions. | Release blocker. Current upstream source requests 10.3.x, but the inspected published runner 2.0.7 still requests 7.x. Ship a verified corrected runner artifact, review current advisories, disable unnecessary evaluation where compatible and run semantic regressions. Trusted workflows reduce exposure, not eliminate it. |
| runner/plugin/ref parsers → js-yaml 4.1.0 and 3.14.1 | Parses YAML workflows and external references/specs. Prototype pollution and resource-exhaustion advisories are relevant to supplied files. | Update both major branches transitively; do not accept arbitrary workflows in a shared privileged runner. |
| runner → parse-duration 1.1.0 | Parses string timeouts, retry intervals and delays. Long crafted strings can consume CPU/memory. | Fix/replace through runner with compatibility tests; fixture deadlines do not repair the package. |
| runner / posthog → form-data 4.0.0 | Used for multipart requests; unsafe boundaries and field/filename injection affect multipart, not the JSON-only fixture path. | Patch and test multipart compatibility before making broad API-testing release claims. |
| plugin → json-schema-faker → jsonpath-plus 5.1.0 | `generate` consumes OpenAPI/schema input. Upgrading the runner alone leaves this older JSONPath copy present. | Separate plugin/dependency remediation; generation input is trusted only until resolved. |
| posthog-node 2.6.0 → axios 0.27.2 / follow-redirects | Telemetry HTTP transport. Capture is disabled in all fixture processes; client still initializes. Browser CSRF advisories are not the same as this Node use, but proxy/redirect/credential-handling advisories require review. | Decide opt-in or removal for self-hosting; otherwise upgrade SDK with lifecycle/privacy tests. |
| runner → proxy-agent → pac-proxy-agent → get-uri → basic-ftp 5.0.3 | Proxy/PAC configuration can invoke URI retrieval. Presence does not imply the HTTP fixture invokes FTP listing or downloads. | Patch transitive chain and test enterprise proxy behavior. No production exploit demonstration claimed. |
| runner → liquidless-faker → @faker-js/faker 7.6.0 | Generator/filter dependency; the baseline runner 2.0.0 template path does not wire the newer faker filter as current source does. | Review when moving runner versions; avoid gaining unsafe template execution during upgrade. |
| runner → @grpc/grpc-js / protobufjs / @protobufjs/utf8 | Legacy gRPC/schema parsing path remains installed for compatibility; HTTP fixtures do not exercise it. | Update safely or isolate optional protocol dependencies later. No new protocol work in scope. |
| runner → @xmldom/xmldom 0.8.6 | XML/XPath checks on response bodies. XML parser/serializer denial-of-service/injection findings need call-path review. | Retained compatibility path, still needs remediation before unrestricted targets. |
| ajv / http-cache-semantics / ip-address / socks | Schema validation and HTTP/proxy dependencies. AJV is constructed without `$data`, so that advisory's stated condition is not enabled in this path; no HTML rendering of ip-address output in this CLI. Other proxy/address/cache cases need targeted review. | Do not treat every inherited finding as exploited or harmless; update and verify relevant configurations. |
| argparse → sprintf-js | Formatting/parse helper chain used by YAML tooling; unbounded formatter precision is conditional on crafted format strings reaching it. | Patch transitively; maintain bounded workflow execution. |
| Vite/VitePress/Vue/server-renderer, esbuild, Rollup, PostCSS, minimatch, brace-expansion, nanoid, source-map-js, diff | Development/documentation toolchain; not part of the production-only tarball install. Dev server and generated documentation have different exposure from the CLI. | Update in a focused tooling/docs PR; never expose the development server as a production service. |

No blanket `npm audit fix --force`, ad hoc dependency overrides, or vulnerability
allowlist is introduced. The deterministic fixture suite is separate from a live
registry audit, so a green baseline CI does not mean a clean security audit.

## Recheck

```sh
npm ci --no-audit --no-fund
npm audit --json > audit-all.json
npm audit --omit=dev --json > audit-runtime.json
npm ls --omit=dev --all
```

Expect audit exit 1 until reviewed remediation is complete. Compare resolved
versions, advisory IDs, call paths and exploit preconditions, not just totals.
Before a release, refresh this review and explicitly resolve/accept each remaining
exposure with the owner. This PR is limited to local fixtures and fake secrets;
it does not authorize production use.
