# Changelog

All notable changes to `laranail/validation-js` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.2.0 - 2026-08-23

The first release on real SemVer — the single moving `v0.1.0` tag is retired. Bug IDs (J1…)
reference the release-planning audit's register.

### Fixed

- **The npm package could not be imported under plain Node at all** (J1) —
  `main`/`exports` pointed at the raw TypeScript sources, which Node refuses to type-strip under
  `node_modules`. The package now ships compiled ESM and `.d.ts` under `dist/`, with a `types`
  export condition, and only `dist` is published.
- Advertised `ClientCheckable` parameter names were re-keyed positionally, inverting values
  whenever the author's insertion order differed from the catalogue's — `min`/`max` bounds
  arrived swapped and the browser rejected every in-range value (J3). Named keys now travel as
  written.
- `in`/`not_in` stringified array values (`String(['a']) === 'a'`), green-ticking multi-selects
  Laravel rejects and false-blocking the mirror direction (J4). The runner now follows Laravel:
  loose subset with an `array` rule, plain failure for an array value without one, `not_in` as
  the exact negation.
- Path reads walked the prototype chain, so a segment like `constructor` read as "present" and
  fired presence conditionals on data that was never sent (J13). `get()` and `has()` see own
  properties only; negative array indices are out of bounds.
- `toJson()` output is now safe for the inline `<script>` context it is written for
  (`JSON_HEX_TAG|APOS|QUOT|AMP`) — a translated message containing `</script>` could terminate
  the embedding block (J14). Decoded values are byte-identical.
- `numeric` and `integer` accepted `0x1A`, `0b11`, `0o17` and `Infinity`, because the runner
  coerced with JavaScript's `Number()` while Laravel uses PHP's `is_numeric`, which accepts none
  of them. The browser passed input the server rejects. The check now follows `is_numeric`'s
  grammar, and the same coercion is used wherever a size rule compares by value.

### Added

- A strict TypeScript gate: `tsc --noEmit` (with `noUncheckedIndexedAccess`) runs inside
  `npm test` and CI, Biome formats the source (the generated fixtures excluded — the PHP suite
  owns those), Dependabot watches the npm ecosystem, and `prepublishOnly` runs the full suite
  plus the pack-import check.
- Server-rule parameter stripping documented as a guarantee in `docs/schema.md` — including
  what a schema still does expose — with a regression test over the whole serialized schema.
- Prose counts (fixtures, rule totals) are pinned to the live source by a drift test.
- A build (`npm run build` / `prepack`) producing `dist/` ESM + `.d.ts`, and an
  install-and-import CI gate (`npm run test:pack`) that packs the real tarball, installs it into
  a clean project and imports it under plain Node — the published artifact is now tested, not
  just the sources.
- Mutation testing over the runner's engine files (Stryker, command runner), plus direct unit
  rows for the dotted-path readers mirroring `Arr::get`/`Arr::has` verdicts.
- Independent schema versioning: the wire format's MAJOR version is the only thing a runner
  gates on, letting the exporter and the runner ship on their own schedules.
- `RuleExporter`, which turns any Laravel rule input — pipe string, array, `Rule::` builder,
  rule object — into a JSON schema. It uses Laravel's own `ValidationRuleParser` rather than a
  second parser, so there is no separate set of parsing bugs to disagree with the framework.
- A three-valued result: a field is invalid, valid, or **undetermined**. Rules the browser
  cannot decide never masquerade as passing.
- `RuleCatalogue`, classifying rules as client-checkable or server-only, where anything
  unrecognised — custom, package, or future-Laravel — defaults to the server.
- `@laranail/validation-js`, a zero-dependency TypeScript runner implementing 92 rules.
- Wildcard support. `items.*.email` is expanded against the submitted data by the runner, which
  has it, rather than at export time, which does not; failures name the concrete path. Nested
  patterns work, an empty collection expands to nothing (matching Laravel), and cross-field
  rules resolve within the row before walking outward.
- The conditional presence family — `required_if`, `required_if_accepted`,
  `required_if_declined`, `required_unless`, `required_with`, `required_with_all`,
  `required_without`, `required_without_all` — decided in the browser, since every input they
  need is already there. `exclude_*` deliberately stays on the server: it changes the shape of
  the validated data rather than the verdict, and a client that faked that would have an
  application submit a payload it believed had been filtered.
- Rules from `laranail/validation` that implement `Contracts\ClientCheckable` are checked in
  the browser using the rule's own pattern — `Slug`, `WithoutSpaces`, `SemVer`, `Subdomain`,
  `EthereumAddress`, `CaseStyle`, `Username`, `MonetaryAmount`, `VendorIdentifier`,
  `PostalCode`, `Latitude`, `Longitude` and `CssColor`. A rule may advertise SEVERAL rules —
  `Latitude` is `numeric` plus `between:-90,90` — and a partial advertisement is dropped whole. Anything performing a checksum, a query or IO keeps the server default,
  and an advertised rule name the runner does not implement is ignored rather than shipped.
- A differential test: the PHP suite records Laravel's own verdicts over 499 rule-and-value
  combinations, and the JavaScript suite must reproduce every one. CI regenerates the fixture
  and fails if the committed copy disagrees.
