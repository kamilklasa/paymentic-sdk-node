# Publishing the SDK

Only `packages/sdk` is published as `@kamilklasa/paymentic-sdk-node`. The root workspace and Next.js example are private packages.

## Before publishing

1. Update the SDK version in `packages/sdk/package.json`. Run `pnpm install --lockfile-only` and commit any resulting changes.
2. Run `pnpm check:release`. This checks types, lint, formatting, tests, the example build and installation of the packed SDK.
3. Review the API changes, release notes and package contents. Exercise changed payment flows in a compatible Paymentic sandbox. Offline tests do not establish live provider compatibility.
4. Push the release commit and verify that GitHub CI passes.

Keep the package's unofficial status and MIT attribution. Never reuse a published npm version.

## First publication

Use an npm account with verified email, two-factor authentication and access to the `kamilklasa` scope. From the repository root:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm view @kamilklasa/paymentic-sdk-node version --registry=https://registry.npmjs.org
```

An `E404` means no publicly visible package exists at that name. If a version is returned, verify ownership and choose an unused version. After the checks above, publish the first version locally:

```sh
cd packages/sdk
npm publish --dry-run --access public
npm publish --access public --registry=https://registry.npmjs.org
cd ../..
git tag sdk-v0.1.0
git push origin sdk-v0.1.0
```

Inspect the dry-run file list before running the real publish command. Follow npm's browser/2FA prompts. Use the actual package version in the tag. Do not create a GitHub Release for this already-published version: that would trigger a duplicate npm publication. Remove the first-release notice from the root README after publication.

## Configure automated releases

1. In GitHub **Settings → Environments**, create `npm`. Add required reviewers if you want an additional approval before publishing.
2. In the npm package's **Settings → Trusted Publisher**, choose **GitHub Actions** and enter:
   - Organization or user: `kamilklasa`
   - Repository: `paymentic-sdk-node`
   - Workflow filename: `sdk-publish.yml`
   - Environment: `npm`
   - Allow direct `npm publish` if an allowed-actions setting is shown.

The workflow uses OIDC on a GitHub-hosted runner, so no `NPM_TOKEN` secret is needed. It uses Node.js 24 with npm 11.5.1 or newer. The repository must be public for provenance, and the SDK's `repository.url` must match it. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Subsequent releases

After completing the checks, open **GitHub → Releases → Draft a new release**. Create a tag matching the committed SDK version, for example `sdk-v0.1.1`, targeting the release commit. Add release notes and click **Publish release**.

The [publish workflow](.github/workflows/sdk-publish.yml) validates the version and repository metadata, runs `pnpm check:release`, then publishes the SDK with provenance. Ordinary pushes, pull requests, draft releases and prereleases do not publish. Check the registry before retrying a failed publish job.

## Optional sandbox runner

For repeatable live checks, configure the [Next.js example](examples/nextjs/README.md), then run:

```sh
pnpm build
node --env-file=examples/nextjs/.env.local scripts/sandbox-smoke.mjs start --scenario=hosted
```

Complete the sandbox checkout using the URL in the generated run file. Use that file for subsequent `verify`, `refund` and `webhooks` commands:

```sh
node --env-file=examples/nextjs/.env.local scripts/sandbox-smoke.mjs verify --run .scratch/sdk-release/<run>.json
```

Run files under `.scratch/` contain private checkout links and are ignored by Git. `refund` creates a sandbox refund; the runner records mutation intent and refuses blind retries after ambiguous results. `webhooks` requires the local ngrok inspector on port 4040 and original signed deliveries. The `blik` and `capture` scenarios require compatible sandbox channels.
