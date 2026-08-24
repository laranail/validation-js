# Validate a React form

Wrap the headless hook, render its state, and let a clean verdict submit — React owns every
node.

```tsx
import { useValidation } from '@laranail/validation-js/react';

function Signup({ schema }) {
    const v = useValidation(schema);

    return (
        <form onSubmit={v.handleSubmit((values) => api.post('/users', values))}>
            <input {...v.getFieldProps('email')} />
            {v.touched.email && v.errors.email && <p role="alert">{v.errors.email[0]}</p>}
            <button>Create</button>
        </form>
    );
}
```

The schema arrives however you like — a fetched static export, the dynamic endpoint, or props
from an inline island. Full hook surface: [Adapters](../tools/adapters.md).

---

[← Docs index](../../README.md#documentation)
