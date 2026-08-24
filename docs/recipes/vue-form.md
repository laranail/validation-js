# Validate a Vue form

The composable returns computed refs; wire them to your template and validate on blur.

```vue
<script setup>
import { useValidation } from '@laranail/validation-js/vue';

const v = useValidation(schema);
</script>

<template>
    <input :value="v.values.value.email"
           @input="v.onInput('email', $event)"
           @blur="v.onBlur('email')">
    <p v-if="v.errors.value.email" role="alert">{{ v.errors.value.email[0] }}</p>
</template>
```

Full composable surface: [Adapters](../tools/adapters.md).

---

[← Docs index](../../README.md#documentation)
