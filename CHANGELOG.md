# Changelog

All notable changes to `laranail/validation-js` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `RuleExporter`, which turns any Laravel rule input — pipe string, array, `Rule::` builder,
  rule object — into a JSON schema. It uses Laravel's own `ValidationRuleParser` rather than a
  second parser, so there is no separate set of parsing bugs to disagree with the framework.
- A three-valued result: a field is invalid, valid, or **undetermined**. Rules the browser
  cannot decide never masquerade as passing.
- `RuleCatalogue`, classifying rules as client-checkable or server-only, where anything
  unrecognised — custom, package, or future-Laravel — defaults to the server.
- `@laranail/validation-js`, a zero-dependency TypeScript runner implementing 60 rules.
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
  `EthereumAddress`, `CaseStyle`, `Username`, `MonetaryAmount`, `VendorIdentifier` and
  `PostalCode`. Anything performing a checksum, a query or IO keeps the server default,
  and an advertised rule name the runner does not implement is ignored rather than shipped.
- A differential test: the PHP suite records Laravel's own verdicts over 227 rule-and-value
  combinations, and the JavaScript suite must reproduce every one. CI regenerates the fixture
  and fails if the committed copy disagrees.
