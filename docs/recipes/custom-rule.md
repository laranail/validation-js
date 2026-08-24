# Add a client-side check for a custom rule

A rule the runner does not recognise goes to the server — that is the safe default. When the
check IS expressible in the browser, register it per instance:

```js
validator.registerRule(
    'iban',
    (value) => typeof value === 'string' && isValidIban(value),
    { message: 'The :attribute must be a valid IBAN.' },
);
```

The registration is instance-scoped (two validators can disagree about `iban`), and the server
still re-validates — the client check only saves the round trip. Plugins bundle rules,
resolvers and listeners: [Form runtime](../tools/runtime.md).

---

[← Docs index](../../README.md#documentation)
