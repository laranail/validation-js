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
- A differential test: the PHP suite records Laravel's own verdicts over 156 rule-and-value
  combinations, and the JavaScript suite must reproduce every one. CI regenerates the fixture
  and fails if the committed copy disagrees.
