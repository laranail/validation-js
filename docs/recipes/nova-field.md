# Live validation in a Nova custom field

Nova has no live validation; wrap the headless form inside your custom `FormField.vue` — Nova's
Vue owns the DOM, the library owns the verdict.

```js
import { HeadlessForm } from '@laranail/validation-js';
import { RemoteChannel } from '@laranail/validation-js';

const form = new HeadlessForm(schema, {
    transport: new RemoteChannel('/_laranail/validation/validate/resource'),
});

form.subscribe(() => {
    this.errorMessage = form.snapshot().errors[this.field.attribute]?.[0] ?? null;
});
form.setValue(this.field.attribute, value);
void form.validateField(this.field.attribute);
```

Pair with the [validate endpoint](../transport.md#the-validate-endpoint) for the server-only
rules, since Nova provides no equivalent. Facade surface: [Headless form](../tools/headless.md).

---

[← Docs index](../../README.md#documentation)
