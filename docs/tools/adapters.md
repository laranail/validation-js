# Framework adapters

Thin hooks over [`HeadlessForm`](headless.md) for frameworks that own the DOM — the library
answers with state, the framework renders it. React and Vue ship; Svelte and a web-component
wrapper are deferred until asked for (each is the same ~80 lines over the same core).

Both adapters are offline-first: the engine decides the 97 pure rules with zero round trip. For
a Laravel round trip on `unique`/`exists`, hand them a `transport`, or compose with Laravel's
own Precognition adapters — reused, not reimplemented.

## React — `useValidation`

```tsx
import { useValidation } from '@laranail/validation-js/react';

function SignupForm({ schema }) {
    const v = useValidation(schema);

    return (
        <form onSubmit={v.handleSubmit((values) => api.post('/users', values))}>
            <input {...v.getFieldProps('email')} />
            {v.touched.email && v.errors.email && <p role="alert">{v.errors.email[0]}</p>}
            <button disabled={v.validating}>Create</button>
        </form>
    );
}
```

The react-hook-form shape: `getFieldProps(path)` returns `{ name, value, onChange, onBlur }`
(controlled; checkboxes read `checked`); `handleSubmit(onValid)` prevents default, validates,
marks failing fields touched on refusal, and calls `onValid(values)` on a clean verdict —
undetermined fields do not block, the server answers on the real request. State arrives through
`useSyncExternalStore`, tearing-free under concurrent rendering, and the hook survives
StrictMode's mount–unmount–mount by recreating the destroyed form in the re-run effect.

`setValue`, `setErrors` (for the real submit's 422), `reset`, `validate({ only })`,
`validateField` and the raw `form` are all returned.

## Vue 3 — `useValidation`

```vue
<script setup>
import { useValidation } from '@laranail/validation-js/vue';

const v = useValidation(schema, { values: { email: '' } });
</script>

<template>
    <form @submit.prevent="v.validate().then(r => r.valid && submit())">
        <input :value="v.values.value.email"
               @input="v.onInput('email', $event)"
               @blur="v.onBlur('email')">
        <p v-if="v.touched.value.email && v.errors.value.email" role="alert">
            {{ v.errors.value.email[0] }}
        </p>
    </form>
</template>
```

VeeValidate-shaped computed refs (`values`, `errors`, `touched`, `validating`,
`undetermined`, `valid`) over a `shallowRef` snapshot swap — one reactive trigger per change,
no deep watching. `onInput`/`onBlur` are the v-model glue; the same `setErrors`/`reset`/
`validate` helpers and the raw `form` are returned. Inside a component the composable cleans up
on unmount; outside one (a test, a store), call `form.destroy()` yourself.

---

[← Docs index](../../README.md#documentation)
