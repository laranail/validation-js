# Validate inside an Alpine component

Register the plugin, point `x-data` at the island, and reach the validator through the magic.

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

Lifecycle and naming details: [Bridges](../tools/bridges.md).

---

[← Docs index](../../README.md#documentation)
