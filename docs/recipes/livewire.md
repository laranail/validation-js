# Use the runtime inside a Livewire component

Keep the validated form inside `wire:ignore` (Livewire morphs DOM it owns), refresh after
morphs, and map action errors back.

```html
<div wire:ignore>
    <form data-laranail="profile">…</form>
</div>
```

```js
import { boot } from '@laranail/validation-js/autoboot';

const handle = boot();

Livewire.hook('morph.updated', () => {
    for (const v of handle.validators()) v.refresh();
});
```

```js
// After a Livewire action returns validation errors:
validator.setErrors(errors);
```

Why these rules exist: [Bridges](../tools/bridges.md#livewire) and
[Architecture](../architecture.md#filament-and-nova).

---

[← Docs index](../../README.md#documentation)
