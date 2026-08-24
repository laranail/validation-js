# Wire a Blade form with no JavaScript of your own

Render the island next to a marked form and boot once for the whole page.

```blade
<form method="POST" action="/users" data-laranail="signup">
    @csrf
    <input name="email">
    <button>Create</button>
</form>

<x-laranail-validation-js::schema :request="App\Http\Requests\StoreUserRequest::class" id="signup" />
```

```js
import { boot } from '@laranail/validation-js/autoboot';
boot();
```

HTMX and Turbo swaps re-wire automatically. Attributes, options and the swap lifecycle:
[Bridges](../tools/bridges.md).

---

[← Docs index](../../README.md#documentation)
