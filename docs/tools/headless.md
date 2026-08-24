# Headless form

`HeadlessForm` is the stateful, DOM-free form — values in, `{ valid, errors, touched,
validating, undetermined }` out — the substrate the framework adapters wrap and the right
surface anywhere the rendering is yours: React, Vue, a Nova field, SSR, a worker, a test.

## Surface

```ts
import { HeadlessForm } from '@laranail/validation-js';

const form = new HeadlessForm(schema, {
    values: { email: '' },
    rules: {},        // instance-scoped extra checks
    messages: {},
    transport,        // optional: anything with resolve()/abort() — RemoteChannel qualifies
});
```

| Member | Does |
|---|---|
| `snapshot()` | the current immutable state — REPLACED on change, stable between changes, which is exactly the `useSyncExternalStore` contract |
| `subscribe(fn)` | change notification; returns the unsubscriber |
| `setValue(path, v)` / `setValues(v)` / `touch(path)` | state in |
| `validate({ only? })` | whole form; `only` narrows what is reported while everything evaluates |
| `validateField(path)` | one field, latest-wins; resolves undetermined fields through the transport when one is wired |
| `setErrors(errors)` | merge a server 422 map; those fields become touched so touched-filtering UIs reveal them |
| `reset(values?)` | clears errors/touched/undetermined and invalidates every in-flight evaluation |
| `destroy()` | aborts the transport; later calls are inert. `isDestroyed` tells an adapter to recreate rather than revive |

## Semantics worth knowing

- `valid` means "no known client failure" — never "the server will accept it". Undetermined
  fields are listed separately and do not block.
- A transport's `clean` answer is the one moment an undetermined field earns valid; every
  non-answer leaves it undetermined. The channel never fails open.
- `validateField` applies its outcome to the field plus fields already showing errors — fixing
  field A never paints a failure onto untouched field B.

## `createHeadless`

The stateless flavour — the bare engine with instance-scoped rules, no state kept:

```ts
const engine = createHeadless(schema, { rules, messages });
engine.validate(values);        // Result
await engine.validateAsync(values);
```

---

[← Docs index](../../README.md#documentation)
