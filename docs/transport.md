# Transport

How a schema reaches the browser, and how an undetermined field reaches the server — three
delivery tiers on the PHP side and one remote channel on the JavaScript side. Every shape here
is derived from the threat model that preceded the code; the guarantees are pinned by tests, not
by convention.

## The one factory

Every tier exports through `SchemaFactory` — the inline Blade island, the static export
command, and the dynamic endpoint all call the same path. That is what makes the
`SchemaExporting` event a real redaction seam: a listener that removes a field removes it from
every tier, because no tier can reach the exporter around it. `SchemaExported` announces the
finished document (schema plus optional key) for logging or cache-busting.

```php
Event::listen(SchemaExporting::class, function (SchemaExporting $event): void {
    unset($event->rules['internal_flag']); // gone from every tier
});
```

`SchemaFactory::forRequest()` builds the FormRequest **through the container** — created from
the current request, container and redirector attached, `rules()` invoked with dependency
injection — because `rules()` may read `$this->route(...)` or `$this->user()`. A `rules()` that
still cannot run outside a live request throws `SchemaExportException` naming the class. It
never returns a silent empty schema, which would switch client validation off while looking
configured.

## Tier 1 — inline Blade island

```blade
@laranailValidation(\App\Http\Requests\StoreUserRequest::class, 'signup')

<x-laranail-validation-js::schema :request="StoreUserRequest::class" id="signup" />
```

Both render the same inert JSON data island:

```html
<script type="application/json" data-laranail-schema="signup">{"version":1,…}</script>
```

`type="application/json"` never executes, so the island rides inside a strict CSP without a
`script-src` exemption; pass `nonce:` for policies that gate every script element regardless of
type. The JSON is encoded with `JSON_HEX_TAG|APOS|QUOT|AMP`, so a translated message containing
`</script>` cannot terminate the block. Both surfaces accept a rules array or a FormRequest
class string.

## Tier 2 — static export

```
php artisan laranail::validation-js.export {key?} {--out=resources/js/schemas}
```

Writes each allow-listed schema (from `laranail.validation-js.endpoint.schemas`) to
`{out}/{key}.json` for bundling at build time. An unlisted key is a refusal, not an empty file.

## Tier 3 — dynamic schema endpoint

**Disabled by default.** Enabling it is choosing which FormRequests become browsable:

```php
// config/laranail-validation-js.php
'endpoint' => [
    'enabled' => true,
    'path' => '/_laranail/validation/schema',
    'schemas' => ['signup' => StoreUserRequest::class],
    'middleware' => ['web', 'auth'],
],
```

Schemas resolve **only** through the key → class allow-list — the request supplies a key, never
a class name, so the endpoint cannot be steered to arbitrary classes. Unknown keys are a bare
404. Responses carry a stable `ETag` (a conditional request answers 304) and
`Cache-Control: private`, since a schema may be user-shaped.

Server-only rule **parameters never travel** on any tier: `unique:users,email` exports as the
bare name `"unique"` under `server`, so table and column names stay out of the page source.

## The validate endpoint

For RuleSets — plain rules arrays with no FormRequest behind them — the package ships an
opt-in, Precognition-compatible endpoint:

```php
'validate' => ['enabled' => true, 'throttle' => '30,1', 'middleware' => ['web']],
```

```php
app(RemoteRegistry::class)->register(
    'profile',
    rules: fn (): array => ['email' => 'required|email|unique:users'],
    authorize: fn (Request $request): bool => $request->user() !== null,
);
```

The authorization closure is **required by signature** — RuleSets have no `authorize()`, so the
registry fails closed at registration rather than shipping an open validator. Authorization runs
first and denies with a uniform 403.

The outcome shape is uniform: 204 with a `Precognition: true` header on pass, 422 with
`{"errors": {...}}` on failure — malformed and missing input produce the same skeleton, so an
enumerator learns nothing from the shape. A `Precognition-Validate-Only` header narrows which
failures are *reported* while the full payload is still validated, which is what lets
cross-field rules see the whole submission. The route sits behind the configured throttle.

`RemoteValidationAttempted` fires per attempt with the endpoint key, the field names, and the
outcome — **never values** — for rate-anomaly monitoring without a PII sink.

FormRequests need none of this: route them through Laravel's own
`HandlePrecognitiveRequests` middleware and their `authorize()` is inherited for free.

## The browser side — `RemoteChannel`

```js
import { createValidator, RemoteChannel } from '@laranail/validation-js';

createValidator(form, schema, {
    transport: new RemoteChannel('/_laranail/validation/validate/profile'),
});
```

When the engine leaves fields undetermined (server-only rules like `unique`), the runtime sends
the **full current payload** with `Precognition-Validate-Only` naming those fields —
Precognition's own vocabulary, no bespoke protocol. Laravel's `XSRF-TOKEN` cookie is forwarded
as `X-XSRF-TOKEN` automatically.

The channel is degradable by design:

- **Latest wins** — a new resolution aborts the in-flight one, whose caller gets a `stale`
  outcome that produces no verdict at all.
- **Every non-answer** — offline, 403, 429, 500, malformed body — degrades to `unreachable`,
  which the runtime paints as *transient undetermined*: no error message, no false green, and
  the field submits normally for the server to decide. The channel never fails open.
- A **204** is the one moment an undetermined field earns `valid`; a **422** paints the
  server's own message on the field.

Submit deliberately does not wait on the channel — undetermined fields submit and the server
answers authoritatively, so the remote channel is a courtesy, never a gate.

---

[← Docs index](../README.md#documentation)
