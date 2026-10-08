# Privacy

This fork sends no CLI usage telemetry, initializes no analytics client and
creates no persistent analytics identity. The upstream PostHog integration and
its dependencies have been removed. `STEPCI_DISABLE_ANALYTICS` can remain set for
compatibility, but is no longer necessary.

Workflows still contact the services and references they specify. Dependency
installation contacts package registries. The documentation website retains
upstream assets and navigation; this CLI policy does not describe those external
sites. Hosting is not enabled by the documentation build.

Supply credentials through the CI secret store and `STEPCI_SECRETS`, a JSON object
whose values are strings. Existing `--secret` options remain supported and take
precedence. The CLI redacts known secret values and sensitive authentication
fields from normal, verbose and error diagnostics. It does not rewrite workflow
files or server logs. Avoid placing secrets in ordinary environment variables,
workflow names or source-controlled files.
