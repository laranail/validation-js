# Bridges

Optional modules wiring the form runtime into server-rendered stacks — Blade, Alpine, HTMX,
Turbo, Livewire. Each is a subpath import; none is loaded unless asked for.

## Autoboot — `@laranail/validation-js/autoboot`

Declarative wiring for pages that ship HTML, not JavaScript:

```html
<form data-laranail="signup" data-laranail-mode="eager" data-laranail-debounce="300">…</form>
<x-laranail-validation-js::schema :request="StoreUserRequest::class" id="signup" />

<script type="module">
    import { boot } from '@laranail/validation-js/autoboot';
    boot();
</script>
```

`boot(options)` scans for `form[data-laranail]`, reads each form's schema island by id, and
attaches a validator (idempotently — a re-scan of a live form replaces, never stacks). It
listens for the swap events of each ecosystem — `htmx:afterSwap`, `turbo:load`,
`turbo:frame-load`, `livewire:navigated` — re-scanning the swapped subtree and destroying
validators whose forms left the document. `data-laranail-endpoint` (or `options.endpoint`)
wires a `RemoteChannel` per form.

A form whose island is missing or malformed is left alone — native constraints and the server
round trip still own it. The handle returned by `boot()` exposes `scan(root?)`,
`validators()`, and `stop()`.

`readSchemaIsland(id)` is exported for hand-wired setups.

## Alpine — `@laranail/validation-js/alpine`

```js
import Alpine from 'alpinejs';
import { laranailAlpine } from '@laranail/validation-js/alpine';

Alpine.plugin(laranailAlpine());
Alpine.start();
```

```html
<form x-data="laranailForm('signup')">
    <input name="email">
    <button type="button" @click="$laranail.validate()">Check</button>
</form>
```

`laranailForm(schemaId, options?)` owns the validator's lifecycle alongside the component's —
Alpine's `destroy()` tears it down. The `$laranail` magic resolves the validator for the
closest form. The component name is camelCase because `x-data` evaluates as JavaScript — a
hyphen would parse as subtraction.

## Livewire

Two rules, both consequences of Livewire morphing the DOM it owns (§5.9):

1. The validated form lives inside `wire:ignore` — painted messages inside morphed DOM are
   fought, not kept.
2. `boot()` already re-scans on `livewire:navigated`; for morph-driven updates inside a
   component, call `validator.refresh()` from a `morph.updated` hook so removed fields are
   forgotten.

Server errors from a Livewire action map back with `validator.setErrors(errors)`. For
Filament, integrate through the PHP core instead — see
[Architecture](../architecture.md#filament-and-nova).

---

[← Docs index](../../README.md#documentation)
