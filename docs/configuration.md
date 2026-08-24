# Configuration

All configuration lives under the flat org key `laranail.validation-js.*`; the publishable file
is `config/laranail-validation-js.php`, prefixed so `vendor:publish` cannot clobber an
application's own `config/validation-js.php`.

```bash
php artisan vendor:publish --tag=laranail::validation-js-config
```

## `endpoint` — the dynamic schema endpoint

Disabled by default; enabling it is choosing which FormRequests become browsable.

| Key | Default | Meaning |
|---|---|---|
| `endpoint.enabled` | `false` | Register the GET route at all |
| `endpoint.path` | `/_laranail/validation/schema` | Route prefix; the key is appended |
| `endpoint.schemas` | `[]` | The allow-list: `'signup' => StoreUserRequest::class`. Keys are the only thing the request can name — never classes |
| `endpoint.middleware` | `['web']` | Wrapped around the route — put your auth here |

## `validate` — the remote validate endpoint

Also opt-in. A registered RuleSet must carry its own authorization closure; the registry
refuses one without it.

| Key | Default | Meaning |
|---|---|---|
| `validate.enabled` | `false` | Register the POST route |
| `validate.path` | `/_laranail/validation/validate` | Route prefix; the registry key is appended |
| `validate.middleware` | `['web']` | Wrapped around the route |
| `validate.throttle` | `'30,1'` | Laravel throttle spec guarding probing |

## `runtime` — browser defaults

Defaults surfaced alongside the schema for the Blade tier; `data-laranail-mode` /
`data-laranail-debounce` attributes and explicit `createValidator` options override them
per form.

| Key | Default | Meaning |
|---|---|---|
| `runtime.mode` | `'eager'` | Scheduler mode: quiet until a field first fails, live after |
| `runtime.debounce` | `300` | Milliseconds between keystrokes and evaluation |

## JavaScript options

Browser-side configuration is per-instance, not global — two validators on one page can
disagree about everything:

```js
createValidator(form, schema, {
    mode: 'eager',              // 'eager' | 'live' | 'blur' | 'submit'
    debounce: 300,
    renderer: new ClassMapRenderer(presets.bootstrap5),
    resolvers: [],              // input-widget plugins (select2 etc.)
    rules: { iban: (v) => … },  // instance-scoped extra checks
    messages: { iban: 'The :attribute must be a valid IBAN.' },
    locale: 'en',
    transport: new RemoteChannel('/_laranail/validation/validate/profile'),
});
```

---

[← Docs index](../README.md#documentation)
