# Architecture

Two packages, one wire contract, and a layered browser runtime where every layer is usable
without the ones above it — plus the reasoning behind the integration decisions that shaped
them.

## The split

`laranail/validation-js` (PHP) knows Laravel: it reads rules, resolves FormRequests through the
container, and writes the JSON schema. `@laranail/validation-js` (npm) knows nothing about
Laravel except that schema. The two upgrade separately — see
[Schema](schema.md#shipping-the-two-halves-apart) for the format discipline that makes that
safe.

## Browser layers

| Layer | Module | Owns |
|---|---|---|
| 0 — engine | `validate()` / `validateAsync()` | pure verdicts: values + schema → `{ valid, failures, undetermined }`. Zero DOM, zero dependencies, ≤ 8 KB budget |
| 0.5 — headless form | `HeadlessForm`, `createHeadless()` | stateful DOM-free form: values, errors, touched, validating, subscribe. The substrate the framework adapters wrap |
| 1 — form runtime | `createValidator()` / `FormController` | a real `<form>`: when validation runs (Scheduler), what the user touched, how failures paint (Renderer) and announce (a11y, in core) |
| 2 — delivery | bridges, adapters, transport | Alpine/autoboot wiring, React/Vue hooks, the Precognition channel |

Everything is instance-scoped: rule registries copy-on-write over a read-only built-in table,
per-instance event emitters and abort tokens, idempotent attach-replaces, leak-free destroy.
N validators coexist on one page with zero shared mutable state.

## Why the verdict is three-valued

A browser cannot check `unique`. Collapsing "cannot check" into "passed" is the lie most
client-side validation tells; collapsing it into "failed" blocks valid input. `undetermined` is
the honest third value: the field submits normally, the server decides, and the UI can say
"checking" instead of guessing. Every degradation in the system — unknown rule, missing
parameter, unreachable endpoint, refused schema major — lands on undetermined, never on a
manufactured verdict.

## Why the adapters are headless

Frameworks that own the DOM (React's reconciler, Vue's and Svelte's reactivity) fight any
library that mutates their nodes. The adapters therefore wrap the stateful `HeadlessForm` —
state out, rendering theirs — which is the established pattern (react-hook-form, VeeValidate,
Felte). The DOM-binding `FormController` exists for the contexts where no framework owns state:
Blade, plain HTML, Alpine, HTMX, Turbo.

## Why there is no Inertia adapter, and Precognition is reused

"Run a FormRequest's rules on the client by round-tripping to Laravel" is a first-party Laravel
feature — Precognition — with official Vue/React/Alpine adapters and built-in Inertia 2.3+
support. Shipping our own round-tripping adapter for those stacks would reimplement it, worse.
The decision (§14.8 of the design): **reuse** Precognition there. This package's differentiator
is the thing Precognition cannot do — offline, instant, zero-round-trip evaluation of the 97
pure rules — and the two compose: our engine for local verdicts, Precognition (or our
`RemoteChannel`, speaking the same protocol) for the server round trip.

## Filament and Nova

**Filament** validates server-side through Livewire and morphs the DOM it owns; a DOM-mutating
JS validator conflicts by construction. Filament integration is therefore the **PHP** core —
fluent rules on the Field — with no JS bolt-on.

**Nova** has no live validation and no Precognition equivalent, which makes it the strongest
additive case: a custom `FormField.vue` wraps the **headless** facade (Nova's Vue owns the
DOM), paired with the [validate endpoint](transport.md#the-validate-endpoint) for the
server-only rules, since Nova provides none.

## Not in this library

Deliberate non-goals, recorded so scope creep is a decision: no client-side authority (the
server always re-validates), no reimplemented client version of `unique`/`exists`/DB/IO rules,
no jQuery or framework-coupled core, no bespoke per-field remote protocol (Precognition's
`Validate-Only` already expresses it), no CDN-race asset loader. The Svelte adapter and a
web-component wrapper are deferred until asked for (§14.9) — both are thin wrappers over the
same `HeadlessForm`, so adding one later is cheap.

---

[← Docs index](../README.md#documentation)
