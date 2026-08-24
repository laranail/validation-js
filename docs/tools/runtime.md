# Form runtime

`createValidator(form, schema, options)` binds a real `<form>` to the engine and returns the
`Validator` — the DOM-owning half of the library, for pages where no framework owns state.

## The `Validator` surface

| Member | Does |
|---|---|
| `validate(options?)` | whole-form verdict; `{ only: ['email'] }` evaluates everything but REPORTS one step (wizard mode) |
| `validateField(field)` | one field, latest-wins under a monotonic token; paints the field plus fields already showing feedback |
| `submit()` | validates, renders the `role="alert"` summary and focuses the first failure on refusal, or performs native submission |
| `setErrors(errors)` | maps a real submit's 422 body onto the fields, through the same renderer and aria plumbing |
| `refresh()` | re-syncs after DOM mutation: state for removed controls (repeater rows, swapped fragments) is cleared instead of leaked; new controls are live already via delegation |
| `state(field)` / `explain(field)` | current `FieldState`; which rules run client-side and which wait for the server |
| `on(event, handler)` | instance events; the same events also bubble as cancelable `laranail:*` CustomEvents carrying `validatorId` |
| `registerRule(name, check, { message })` / `use(plugin)` | instance-scoped extension — the built-in table is never mutated |
| `destroy()` | removes every listener, timer, generated element and aria attribute; `leakReport()` proves it |

## Scheduling

Four modes: `eager` (default — quiet until a field first fails, live afterwards), `live`,
`blur`, `submit`. Debounce applies to keystroke-triggered runs. Field-level validation
evaluates the WHOLE form (cross-field rules need the full picture) but applies the outcome only
to the triggered field and fields the user has already seen feedback on — an untouched field is
never painted because its neighbour blurred.

## Progressive enhancement

`novalidate` is set only once the runtime actually attaches, and removed on destroy if the
runtime added it. If the script never loads, native HTML5 constraints and the server round trip
still own the form — it never becomes unsubmittable because JS broke.

## Accessibility (in core, not in renderers)

`aria-invalid`, non-destructive `aria-describedby` (our generated id is appended and only ours
removed), one visually-hidden polite live region per form, a `role="alert"` failure summary,
focus-first-invalid with `prefers-reduced-motion` respected. These live in the controller so no
renderer choice can un-ship them.

## Rendering and inputs

`ClassMapRenderer` works from plain-data presets (`bootstrap5`, `tailwind`, `bulma`,
`vanilla`) or any custom class map; `headlessRenderer` paints nothing. Input-widget resolvers
(`resolvers`, `ResolverRegistry`) teach value extraction and wrapper location for enhanced
widgets. The NameMapper handles `items[0][qty]` ⇄ `items.0.qty`, radio groups, checkbox arrays
and multi-selects.

## Debug tracing

```js
import { attachDebug } from '@laranail/validation-js/debug';

const detach = attachDebug(validator);
```

Collapsed console groups per verdict — including WHY a field is undetermined (structural:
names the server-only rules; transient: the remote channel could not answer). A separate
subpath so production bundles that never import it carry zero bytes of it.

---

[← Docs index](../../README.md#documentation)
