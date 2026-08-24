# Validate a multi-step form one step at a time

Evaluate the whole form (cross-field rules need the full picture) but report only the current
step's fields.

```js
const result = await validator.validate({ only: ['email', 'password'] });

if (result.failures.every((f) => !['email', 'password'].includes(f.field))) {
    goToStepTwo();
}
```

The same `{ only }` option exists on `HeadlessForm.validate()`. Reference:
[Form runtime](../tools/runtime.md).

---

[← Docs index](../../README.md#documentation)
