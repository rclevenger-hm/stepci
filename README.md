![Screen Recording 2023-10-04 at 15 43 17](https://github.com/stepci/stepci/assets/10400064/881efd49-fd93-4ff8-8e99-4b6e24fe1227)

> **Note**
> We just announced [Support Plan](https://stepci.com/#pricing) for Step CI

> **Important**
> For users migrating from Postman and Insomnia, see issues [#29](https://github.com/stepci/stepci/issues/29) and [#30](https://github.com/stepci/stepci/issues/30) respectively

# Welcome

## Self-hosted development

This fork is establishing reliable post-deployment HTTP/JSON checks for platform
teams. Work from `dev` and start with the
[development and verification guide](docs/maintainers/dev.md) for the runner
revision, fixed failure behavior, secret handling, migration notes and release
gates. Feature PRs target `dev`; owner-approved squash PRs promote it to `main`.

Use Node **24.21.0**, npm **11.9.0**, then `npm ci` and `npm run verify`.
Tests run only against a local HTTP fixture and use fake credentials.
`npm run package` creates a locked local tarball; it does not publish it.
The package manifest records the source commit and file hashes. Corresponding
source is available in [this repository](https://github.com/rclevenger-hm/stepci);
retain its MPL-2.0 license and notices when distributing modifications.

The installation commands and public-service examples below describe upstream
StepCI. They do not install this fork or constitute its acceptance suite.

Step CI is an open-source API Quality Assurance framework

- **Language-agnostic**. Configure easily using YAML, JSON or JavaScript
- **REST, GraphQL, gRPC, tRPC, SOAP**. Test different API types in one workflow
- **Self-hosted**. Test services on your network, locally and CI/CD
- **Integrated**. Play nicely with others

[→ **Read the Docs**](https://docs.stepci.com)

[→ **Try the Online Playground**](https://stepci.com)

[→ **Join us on Discord**](https://discord.gg/KqJJzJ3BTu)

## Get started

1. Install the CLI

   **Using [Node.js](https://nodejs.org/en/)**

    ```
    npm install -g stepci
    ```

    > **Note**: Make sure you're using the LTS version of Node.js

    **Using [Homebrew](https://brew.sh/)**

    ```
    brew install stepci
    ```

2. Create example workflow

    **workflow.yml**

    ```yaml
    version: "1.1"
    name: Status Check
    env:
      host: example.com
    tests:
      example:
        steps:
          - name: GET request
            http:
              url: https://${{env.host}}
              method: GET
              check:
                status: /^20/
    ```

    > **Note**: You can also also use JSON format to configure your workflow

3. Run the workflow

    ```
    stepci run workflow.yml
    ```

    ```
    PASS  example

    Tests: 0 failed, 1 passed, 1 total
    Steps: 0 failed, 1 passed, 1 total
    Time:  0.559s, estimated 1s

    Workflow passed after 0.559s
    ```

## Documentation

Documentation is available on [docs.stepci.com](https://docs.stepci.com)

## Examples

You can find example workflows under [`examples/`](examples/)

## Community

Join our community on [Discord](https://discord.gg/KqJJzJ3BTu) and [GitHub](https://github.com/stepci/stepci/discussions)

## Contributing

As an open-source project, we welcome contributions from the community. If you are experiencing any bugs or want to add some improvements, please feel free to open an issue or pull request

## Support Plan

Get Pro-level support with SLA, onboarding, prioritized feature-requests and bugfixes.

[→ **Learn more**](https://stepci.com/#pricing)

<a href="https://cal.com/ushakov/step-ci-demo"><img alt="Book us with Cal.com" src="https://cal.com/book-with-cal-dark.svg" /></a>

## Privacy

This fork sends no usage telemetry and creates no persistent analytics identity.
The inherited PostHog client and its dependencies have been removed.
`STEPCI_DISABLE_ANALYTICS` is no longer needed and remains harmless if already set.

Use `STEPCI_SECRETS` (a JSON object supplied by your CI secret store) to pass secrets
without putting their values in CLI arguments. Existing `--secret key=value`
options still work and override environment secrets. Declared secrets and
sensitive authentication fields are redacted from CLI diagnostics; keep raw
workflow files and fixture/server logs private if they contain credentials.

See [the dev guide](docs/maintainers/dev.md) for the runner revision, matcher
semantics, dependency updates and the dev-to-main review process.

## License

The source code is distributed under Mozilla Public License terms
