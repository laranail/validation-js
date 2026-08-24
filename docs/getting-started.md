# Getting started

One path through the whole system: export a FormRequest's rules, put the schema on a page, and
let the runtime validate as the user types — with everything the browser cannot decide going to
the server, honestly.

## 1. Export the schema

The Blade component renders an inert JSON data island from your FormRequest — container-built,
so `rules()` can read the route or the user:

```blade
<x-laranail-validation-js::schema :request="App\Http\Requests\StoreUserRequest::class" id="signup" />
```

The other tiers — a static export command and an opt-in dynamic endpoint — are covered in
[Transport](transport.md).

## 2. Wire the form

The zero-code path — mark the form and boot:

```html
<form method="POST" action="/users" data-laranail="signup">
    <input name="email">
    <input name="name">
    <button>Create</button>
</form>

<script type="module">
    import { boot } from '@laranail/validation-js/autoboot';
    boot();
</script>
```

Or explicitly, with full control:

```js
import { createValidator, ClassMapRenderer, presets } from '@laranail/validation-js';
import { readSchemaIsland } from '@laranail/validation-js/autoboot';

const validator = createValidator(
    document.querySelector('form'),
    readSchemaIsland('signup'),
    { renderer: new ClassMapRenderer(presets.bootstrap5), mode: 'eager' },
);
```

The form keeps native HTML5 constraints until the runtime actually attaches — if the script
never loads, nothing was taken away.

## 3. Read the three-valued verdict

A field is invalid, valid, or **undetermined** — carrying a rule only the server can decide
(`unique`, `exists`, a custom rule the runner does not know). Undetermined fields submit
normally; the server answers. Nothing is ever silently treated as passing.

```js
validator.state('email');    // { status: 'valid' | 'invalid' | 'undetermined' | ... }
validator.explain('email');  // which rules run in the browser, which wait for the server
```

## 4. Handle the real submit

When the server still rejects (a race on `unique`, a rule the browser could not see), map its
422 back onto the same UI:

```js
const response = await fetch('/users', { method: 'POST', body: new FormData(form) });

if (response.status === 422) {
    validator.setErrors((await response.json()).errors);
}
```

## Where to go next

- A SPA where React or Vue owns the DOM → [Adapters](tools/adapters.md)
- Alpine, HTMX, Turbo, Livewire → [Bridges](tools/bridges.md)
- Live server resolution of `unique` while typing → [Transport](transport.md)
- What every option on `createValidator` does → [Form runtime](tools/runtime.md)

---

[← Docs index](../README.md#documentation)
