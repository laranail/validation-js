# laranail/validation-js

[![Latest version on Packagist](https://img.shields.io/packagist/v/laranail/validation-js.svg)](https://packagist.org/packages/laranail/validation-js)
[![Tests](https://github.com/laranail/validation-js/actions/workflows/run-tests.yml/badge.svg)](https://github.com/laranail/validation-js/actions/workflows/run-tests.yml)
[![Static analysis](https://github.com/laranail/validation-js/actions/workflows/phpstan.yml/badge.svg)](https://github.com/laranail/validation-js/actions/workflows/phpstan.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Export your Laravel validation rules as a JSON schema and check them in the browser — with no round trip, no duplicated rule definitions, and no lying about what the client can actually decide.

Targets PHP `^8.4.1` on Laravel `^13`, and Node `>=22.6`. The JavaScript has **zero dependencies**, runtime and dev.

## The part most client-side validation gets wrong

A browser cannot check `unique`, `exists` or `active_url`. Libraries that quietly treat those as
passing show the user a green tick for input the server is about to reject.

This one is three-valued. A field is invalid, valid, or **undetermined** — carrying at least one
rule only the server can decide:

```ts
const { valid, failures, undetermined } = validate(values, schema);
```

**A rule the exporter does not recognise goes to the server**, including custom rules, package
rules, and rules added by a future Laravel version. The cost of that default is a round trip;
the cost of the other one is a false green tick.

## Install

```bash
composer require laranail/validation-js
npm install @laranail/validation-js
```

## Quick start

Export on the server:

```php
use Simtabi\Laranail\ValidationJs\RuleExporter;

$schema = app(RuleExporter::class)->export(
    (new StoreUserRequest())->rules(),
    attributes: ['email' => 'Email address'],
);
```

Check in the browser:

```ts
import { validate } from '@laranail/validation-js';

const result = validate({ email: '', age: '15' }, schema);

result.valid;         // false
result.failures;      // [{ field: 'email', rule: 'required', message: 'The Email address field is required.' }]
result.undetermined;  // ['email'] — it also carries `unique`, which only the server can answer
```

Submit when `valid` is true, even if `undetermined` is non-empty. The server gives the real
answer; the browser just saves the user a round trip on the things it can be sure about.

## How the parity claim is tested

## Form runtime

The engine gained its form runtime: `createValidator(form, schema, options)` binds a real form
with debounced eager validation, an injectable renderer (`ClassMapRenderer` over plain-data
presets — `bootstrap5`, `tailwind`, `bulma`, `vanilla`), input-widget resolvers, a dual event
channel (instance `on()` plus bubbling `laranail:*` DOM events), and core-owned accessibility:
`aria-invalid`, non-destructive `aria-describedby`, a polite live region, and a `role="alert"`
summary with focus management. `createHeadless(schema)` is the DOM-free facade;
`@laranail/validation-js/regex` ships the fluent regex builder, PHP-symmetric. Everything is
instance-scoped — two validators coexist on one page, attach is idempotent, and `destroy()` is
leak-free, all pinned by the Playwright suite. The engine stays zero-dependency with a CI
bundle budget (Layer 0 ≤ 8 KB min+gzip).

The PHP suite runs **Laravel's own validator** over a grid of 511 rule-and-value combinations,
records its verdicts, and writes them to a fixture. The JavaScript suite then has to reproduce
every one.

That is the only honest way to claim the runner matches Laravel. Asserting it against hand-written
expectations would prove it matches what its author *believed* Laravel does — and while building
this, four of those beliefs turned out to be wrong:

| I assumed | Laravel actually |
|---|---|
| `email` needs a dot in the domain | accepts `a@b` — the default validation is RFC, not "has a TLD" |
| `max:5` compares `"6"` numerically | compares string LENGTH unless a numeric rule is present |
| `contains:foo` is a substring test | asks whether the attribute ARRAY contains the value |
| an empty value skips every rule | runs implicit rules anyway — `accepted` on `''` fails |

CI regenerates the fixture and fails if the committed copy disagrees, so the claim cannot rot
into a statement about a past version of Laravel.

## The two packages upgrade separately

`laranail/validation-js` on Packagist writes the schema; `@laranail/validation-js` on npm reads
it. They are separate releases and neither waits for the other.

That is a property of the format, not a promise. Within a major schema version every change is
additive: the runner ignores keys it does not recognise, degrades a rule whose parameters it
cannot find to **undetermined** rather than guessing, and a renamed key is emitted under both
names for as long as anyone is running the old code. A mismatch costs precision — some fields
round trip that need not have — and never correctness.

The alternative, which this replaced, was a version check that fired on any change and sent
whole forms to the server until both halves were upgraded in step. See
[Schema](docs/schema.md#shipping-the-two-halves-apart).

## <a name="documentation"></a>Documentation

- [Schema](docs/schema.md) — the contract both halves implement
- [Transport](docs/transport.md) — the three delivery tiers, the validate endpoint, and the remote channel
- [Rules](docs/tools/rules.md) — what runs in the browser, what does not, and why
- [Upgrading](UPGRADING.md) — why the two packages upgrade separately, and what would change that

## Prior art

The two ideas at the centre of this — a client allow-list with an unknown-rule fallback to the
server, and a positional-to-named parameter table — were established by
[proengsoft/laravel-jsvalidation](https://github.com/proengsoft/laravel-jsvalidation). No code was
carried over; that package is MIT and a derivative would inherit its attribution obligation. See
[CREDITS.md](CREDITS.md).

## License

MIT © Simtabi LLC. See [LICENSE](LICENSE).
