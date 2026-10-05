# Release

How the two halves of this package version and ship — three independent lines, one discipline.

## Three version lines

| Line | Where | Moves when |
|---|---|---|
| PHP package | git tags on this repo (VCS-resolved; laranail does not publish to Packagist routinely) | the PHP surface changes |
| npm package | `package.json` `version` + npm publish | the JS surface changes |
| Wire schema | `RuleExporter::VERSION` ↔ `SCHEMA_VERSION` | only on a BREAKING wire change — additive changes never bump it |

The packages do not move in lockstep; the schema contract
([Schema](schema.md#shipping-the-two-halves-apart)) is what lets an older runner meet a newer
exporter and lose only precision, never correctness.

## Cutting a release

1. `CHANGELOG.md` gains the version section — the release body is extracted from it by
   `release.yml`, so a release without a real description cannot ship.
2. Local gates: `composer test`, `composer phpstan`, `vendor/bin/pint --test`, `npm test`,
   `npm run test:e2e`, `npm run budget`, `npm run test:pack`.
3. `laranail::validation-js.parity` — a sister-repo tag can move what `^0.1` resolves to and
   stale the differential fixtures; regenerating locally is cheaper than a red CI wave.
4. Tag `vX.Y.Z`; the GitHub release carries the CHANGELOG section. npm publish happens from the
   tagged checkout (`prepublishOnly` re-runs the suite and the pack-import check).

## npm or GitHub Packages

The npm job publishes to the registry the repository variable `PUBLISH_REGISTRY` names: npm, the
default, or `github` for GitHub Packages (`npm.pkg.github.com`), which publishes with the run's own
`GITHUB_TOKEN` and needs no npm account. This repository was created after 2026-07-15, so npm's
trusted publishing refuses its immutable OIDC subject
([npm/cli#9969](https://github.com/npm/cli/issues/9969)); npm needs the `NPM_TOKEN` secret, published
without provenance. Both routes stay behind `NPM_PUBLISH_ENABLED`. A version the registry already has
is reported, not failed.

One command publishes every release tag that is not out yet by starting `release.yml` once per tag
with `tag` and `registry` inputs; a hand-started run never touches the GitHub release:

```bash
.dev/tools/npm-release github        # GitHub Packages; needs no npm token
.dev/tools/npm-release npm           # npm, with a granular token (npm_…) on the clipboard
```

`--dry-run` changes nothing and `--help` lists the rest; it needs `gh` signed in as a maintainer.
GitHub Packages asks for authentication even to install a public package: a project installing from
it adds `@laranail:registry=https://npm.pkg.github.com` and
`//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}` to its `.npmrc`, with a `read:packages` token.

> `v0.1.0` is a moving tag, and a registry never lets a version be replaced: the first publish of
> `0.1.0` is the only one that lands, and later tag moves are reported as already published. Publish
> from a tag whose version will not move again.

## Cross-package ordering

When a rule gains client support: ship the **PHP side first** (the exporter degrades an
unimplemented rule to server-tier safely), then the JS runner. Never the reverse — a runner
advertising rules the deployed exporter does not send is harmless, but an exporter advertising
rules the deployed runner cannot evaluate would be a silent hole, and the
[catalogue-drift guard](tools/commands.md#laranailvalidation-jsdoctor) pins the two lists to
exact agreement in CI regardless.

---

[← Docs index](../README.md#documentation)
