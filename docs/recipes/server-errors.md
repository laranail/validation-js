# Map a real 422 back onto the form

The browser validated, the server still refused (a `unique` race, a rule the client cannot
see) — surface the server's own messages in the same UI.

```js
const response = await fetch(form.action, { method: 'POST', body: new FormData(form) });

if (response.status === 422) {
    validator.setErrors((await response.json()).errors);
}
```

`setErrors` also exists on `HeadlessForm` and both adapters, where it additionally marks the
fields touched. Reference: [Form runtime](../tools/runtime.md).

---

[← Docs index](../../README.md#documentation)
