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

## Cross-package ordering

When a rule gains client support: ship the **PHP side first** (the exporter degrades an
unimplemented rule to server-tier safely), then the JS runner. Never the reverse — a runner
advertising rules the deployed exporter does not send is harmless, but an exporter advertising
rules the deployed runner cannot evaluate would be a silent hole, and the
[catalogue-drift guard](tools/commands.md#laranailvalidation-jsdoctor) pins the two lists to
exact agreement in CI regardless.

---

[← Docs index](../README.md#documentation)
