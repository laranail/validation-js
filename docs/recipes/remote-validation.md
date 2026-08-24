# Resolve `unique` while the user types

Register a RuleSet with its authorization on the server, enable the endpoint, and hand the
runtime a channel.

```php
app(RemoteRegistry::class)->register(
    'profile',
    rules: fn (): array => ['email' => 'required|email|unique:users'],
    authorize: fn (Request $request): bool => $request->user() !== null,
);
```

```js
import { createValidator, RemoteChannel } from '@laranail/validation-js';

createValidator(form, schema, {
    transport: new RemoteChannel('/_laranail/validation/validate/profile'),
});
```

Undetermined fields resolve live; an unreachable endpoint degrades to "server decides on
submit", never a false verdict. The full contract and its threat model:
[Transport](../transport.md).

---

[← Docs index](../../README.md#documentation)
