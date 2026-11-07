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
4. Tag `vX.Y.Z`; the GitHub release carries the CHANGELOG section. **The tag publishes nothing to
   npm** — see below.
5. To release the JS half: bump `package.json`'s `version`, land it, then start the publish by hand.
   It runs from the tagged checkout (`prepublishOnly` re-runs the suite and the pack-import check).

## npm or GitHub Packages

The npm job publishes to the registry the repository variable `PUBLISH_REGISTRY` names: npm, the
default, or `github` for GitHub Packages (`npm.pkg.github.com`), which publishes with the run's own
`GITHUB_TOKEN` and needs no npm account. This repository was created after 2026-07-15, so npm's
trusted publishing refuses its immutable OIDC subject
([npm/cli#9969](https://github.com/npm/cli/issues/9969)); npm needs the `NPM_TOKEN` secret, published
without provenance. Both routes stay behind `NPM_PUBLISH_ENABLED`. A version the registry already has
is reported rather than failed, so re-running after a partial publish is safe — but it is reported as
a **warning**, because a run that published nothing must not read as a clean release.

**The publish job is `workflow_dispatch` only.** A tag push creates the GitHub release and stops
there; `tests/ReleaseWorkflowTest.php` fails if the job ever accepts a tag push again. Bump
`package.json` first — the version published is the manifest's, and a registry refuses one it already
has:

```bash
npm version <X.Y.Z> --no-git-tag-version
```

Land that through a pull request, then start the run. One command does it for every release tag not
out yet, by starting `release.yml` once per tag with `tag` and `registry` inputs; the `tag` says which
commit to build, not which version to publish, and a hand-started run never touches the GitHub
release:

```bash
.dev/tools/npm-release github        # GitHub Packages; needs no npm token
.dev/tools/npm-release npm           # npm, with a granular token (npm_…) on the clipboard
```

`--dry-run` changes nothing and `--help` lists the rest; it needs `gh` signed in as a maintainer.
GitHub Packages asks for authentication even to install a public package: a project installing from
it adds `@laranail:registry=https://npm.pkg.github.com` and
`//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}` to its `.npmrc`, with a `read:packages` token.

> **This already happened, and the advice that used to stand here could not be followed.** It read
> *"publish from a tag whose version will not move again"* — but this repository has one tag and it
> moves, so there was no such tag to publish from, and the workflow additionally *required* the
> manifest version to equal it. `@laranail/validation-js@0.1.0` is on GitHub Packages from an early
> tag push, frozen, while the tag has moved on without it; every run since reported success.
>
> The fix is the one the table at the top of this page always described: **the npm line is its own**.
> The tag names the commit, `package.json` names the version, nothing publishes automatically, and
> `0.1.0` is spent — the next release is higher.

## Cross-package ordering

When a rule gains client support: ship the **PHP side first** (the exporter degrades an
unimplemented rule to server-tier safely), then the JS runner. Never the reverse — a runner
advertising rules the deployed exporter does not send is harmless, but an exporter advertising
rules the deployed runner cannot evaluate would be a silent hole, and the
[catalogue-drift guard](tools/commands.md#laranailvalidation-jsdoctor) pins the two lists to
exact agreement in CI regardless.

---

[← Docs index](../README.md#documentation)
