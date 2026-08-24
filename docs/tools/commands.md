# Console commands

Three Artisan commands, org-namespaced per the laranail convention
(`laranail::validation-js.<command>`).

## `laranail::validation-js.export`

```
php artisan laranail::validation-js.export {key?} {--out=resources/js/schemas}
```

Writes allow-listed schemas (from `laranail.validation-js.endpoint.schemas`) to
`{out}/{key}.json` for bundling at build time — the static delivery tier. An unlisted key is a
refusal, not an empty file.

## `laranail::validation-js.doctor`

```
php artisan laranail::validation-js.doctor
```

Schema/wire-format health, answered from the live installation:

| Check | Failure means |
|---|---|
| Exporter and runner declare the same schema major | the two halves were upgraded past a breaking wire change out of step |
| `RuleCatalogue::CLIENT` ↔ the JS engine's `checks` map, exact set equality | a rule advertised as client-side that the runner cannot evaluate (a silent hole), or one the runner implements that needlessly round-trips |
| The parity fixture parses and is non-empty | the differential regression guard has no teeth |
| Every `endpoint.schemas` entry is an existing FormRequest | the endpoint would 500 (missing class) or refuse (not a FormRequest) at request time |

Checks that need repository files (JS sources, fixtures) are skipped with a warning in
packaged installs rather than failed.

## `laranail::validation-js.parity`

```
php artisan laranail::validation-js.parity
```

The CI parity-currency job, made local: regenerates the differential fixtures from Laravel's
own verdicts (running the fixture-writing test suite) and reports whether the tracked file
moved. A dependency bump — including a sister laranail repo cutting a tag that changes what
`^0.1` resolves to — shows up here before it shows up as a red CI wave. Runs only inside the
package checkout (needs pest and git); exits non-zero when fixtures moved, so it can gate a
release script.

---

[← Docs index](../../README.md#documentation)
