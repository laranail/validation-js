# Changelog

All notable changes to `laranail/validation-js` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 1.0.0 - 2026-08-24

The 1.0 major: both halves graduate to real SemVer, the
[stability contract](README.md#stability) becomes binding, and the wire schema's
additive-forever promise starts from this clean v1 baseline. No breaking changes against
v0.2.0 — see UPGRADING.md for the whole 0.1 → 1.0 line.

### Added

- **Framework adapters (JS):** `@laranail/validation-js/react` (a `useValidation` hook in the
  react-hook-form shape — `getFieldProps`, `handleSubmit`, `useSyncExternalStore` state,
  StrictMode-double-mount safe) and `…/vue` (a VeeValidate-shaped Vue 3 composable over a
  `shallowRef` snapshot swap). Both wrap the new stateful **`HeadlessForm`** facade — values
  in, `{ valid, errors, touched, validating, undetermined }` out, `subscribe`/`snapshot` with
  stable identity, `setErrors` (server-422 merge), `reset`, latest-wins `validateField`, and
  optional transport resolution of undetermined fields. React and Vue are optional peer
  dependencies; Svelte is deferred by decision, not omission.
- **Bridges (JS):** `…/autoboot` — declarative wiring for server-rendered pages
  (`form[data-laranail]` + schema islands, idempotent re-scan on `htmx:afterSwap`,
  `turbo:load`, `turbo:frame-load`, `livewire:navigated`, destroy-on-removal) — and
  `…/alpine` — an Alpine plugin registering the `laranailForm` component and `$laranail`
  magic.
- **Form runtime (JS):** `validate({ only })` wizard-step narrowing (everything evaluates,
  one step reports), `setErrors()` mapping a real submit's 422 through the same renderer and
  aria plumbing, `refresh()` forgetting removed repeater rows instead of leaking them, and
  progressive enhancement — `novalidate` is set only once the runtime attaches and restored
  on destroy, so a page whose script never loads keeps native constraints.
- **Debug (JS):** `…/debug` — `attachDebug(validator)` console tracing with per-verdict
  collapsed groups and a plain-language reason for every undetermined field; a separate
  subpath so it tree-shakes out by absence.
- **Console (PHP):** `laranail::validation-js.doctor` (exporter↔runner schema-major agreement,
  exact catalogue↔engine rule-set equality, parity-fixture health, endpoint allow-list
  sanity) and `laranail::validation-js.parity` (the CI fixture-currency job made local —
  regenerate and diff before a sister-repo tag turns into a red CI wave).
- **Guards:** the §7.2 catalogue-drift test pins `RuleCatalogue::CLIENT` and the JS engine's
  `checks` map to exact set agreement, and a live-registry naming test pins every registered
  surface (commands, Blade prefix, route names, config key) to the org convention.
- Docs: the full tree — installation, getting-started, configuration, architecture (including
  the Precognition-reuse, Filament and Nova verdicts), release, per-subsystem reference under
  `docs/tools/`, and ten task recipes.
- Release mechanics: a tag-driven `release.yml` (CHANGELOG-sourced release body, npm publish
  with `--provenance` from CI) and `update-changelog.yml` (backfills hand-authored releases,
  guarded against duplicating what release.yml already sourced). The Composer dist is lean —
  `js/tests/`, `js/e2e/`, tooling configs and scripts are export-ignored.
- A stability boundary: every PHP class is stable-listed or `@internal`, enforced by a test;
  the README states the contract and the deprecation policy.
- A declared browser floor — Safari/iOS 15.4+, Chrome/Edge 93+, Firefox 92+ (`browserslist`),
  set by `Object.hasOwn`. The two regex lookbehinds were refactored away: a lookbehind literal
  is a parse-time SyntaxError on Safari < 16.4, failing the whole module instead of one rule.
- `engines.node` relaxed to `>= 18` for consumers (built ESM); Node ≥ 22.6 remains a
  dev-only requirement for the package's own test suite.

### Changed

- `composer.json` graduates: Simtabi LLC organization author (parity with
  `laranail/validation`), `branch-alias` `1.0.x-dev`, and the `laranail/validation`
  dev constraint moves to `^0.1.1 || ^1.0` — dual-range because this package's PHP floor
  stays `^8.4.1 || ^8.5` while its sister's 1.0 line is PHP `^8.5`-only; the two lines are
  exporter-equivalent (regenerating the parity fixtures against v1.0.0 changes nothing), and
  the CI currency job pins itself to the `^1.0` resolution.

- **Transport (PHP):** three delivery tiers over one `SchemaFactory` path — the
  `@laranailValidation` directive and `<x-laranail-validation-js::schema>` component render an
  inert JSON data island (CSP-safe `type="application/json"`, `JSON_HEX_*`-encoded, optional
  nonce); `laranail::validation-js.export` writes allow-listed schemas to static JSON; an
  opt-in, disabled-by-default GET endpoint serves them dynamically with a stable `ETag`/304 and
  `Cache-Control: private`, resolving keys only through the config allow-list (never class
  strings). `SchemaExporting` is a redaction seam covering every tier; `SchemaExported`
  announces the finished document. `SchemaFactory::forRequest()` container-builds the
  FormRequest so `rules()` can inject dependencies, and throws `SchemaExportException` rather
  than returning a silent empty schema when it cannot run.
- **Transport (PHP):** an opt-in, Precognition-compatible validate endpoint for RuleSets.
  `RemoteRegistry::register()` requires an authorization closure by signature (RuleSets have no
  `authorize()`, so the registry fails closed), outcomes are uniform (204 +
  `Precognition: true` on pass, 422 `{"errors"}` on failure — malformed and missing produce the
  same skeleton), `Precognition-Validate-Only` narrows reported failures while the full payload
  validates, and the route sits behind a configurable throttle.
  `RemoteValidationAttempted` fires with endpoint, field names and outcome — never values.
- **Transport (JS):** `RemoteChannel`, the Precognition client for undetermined fields. Sends
  the full payload with `Precognition-Validate-Only` naming what the engine could not decide,
  forwards Laravel's `XSRF-TOKEN` cookie, and degrades by design: latest-wins abort produces a
  no-verdict `stale`, every non-answer (offline, 403, 429, 500) becomes transient undetermined
  with no message painted, a 204 is the one moment an undetermined field earns `valid`, and a
  422 paints the server's own message. Wire it with the `transport` option of
  `createValidator`; submit never waits on it.
- `config/laranail-validation-js.php` (publishable, read at `laranail.validation-js.*`) with
  both endpoints disabled by default, plus runtime defaults for the Blade tier.

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
- `@laranail/validation-js`, a zero-dependency TypeScript runner implementing 97 rules.
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
- A differential test: the PHP suite records Laravel's own verdicts over 511 rule-and-value
  combinations, and the JavaScript suite must reproduce every one. CI regenerates the fixture
  and fails if the committed copy disagrees.
