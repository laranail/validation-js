# Installation

The two halves install separately — the PHP exporter from the VCS repository, the JavaScript
runner from npm — and upgrade separately by design.

## Requirements

| Half | Requires |
|---|---|
| `laranail/validation-js` (PHP) | PHP `^8.4.1 \|\| ^8.5`, Laravel `^13.0` |
| `@laranail/validation-js` (npm) | Node `>= 22.6` for the dev toolchain; browsers per the bundle you build. Zero runtime dependencies |

## PHP exporter

laranail packages resolve through git VCS repositories, not Packagist. Add the repository
entries (including the transitive `laranail/*` closure) to your root `composer.json`:

```json
{
    "repositories": [
        { "type": "vcs", "url": "https://github.com/laranail/validation-js" },
        { "type": "vcs", "url": "https://github.com/laranail/console" }
    ]
}
```

```bash
composer require laranail/validation-js
```

Publish the config when you want the transport endpoints or to change runtime defaults:

```bash
php artisan vendor:publish --tag=laranail::validation-js-config
```

## JavaScript runner

```bash
npm install @laranail/validation-js
```

The package ships compiled ESM plus `.d.ts` under `dist/`, with subpath exports for the
optional pieces — each costs nothing unless imported:

| Import | Contains |
|---|---|
| `@laranail/validation-js` | engine, form runtime, headless facade, transport channel |
| `@laranail/validation-js/regex` | the fluent regex builder |
| `@laranail/validation-js/react` | the React hook (peer: `react ^18 \|\| ^19`) |
| `@laranail/validation-js/vue` | the Vue 3 composable (peer: `vue ^3.3`) |
| `@laranail/validation-js/alpine` | the Alpine plugin |
| `@laranail/validation-js/autoboot` | declarative wiring for Blade/HTMX/Turbo pages |
| `@laranail/validation-js/debug` | console tracing — tree-shakes out by absence |

React and Vue are optional peer dependencies: installs without them succeed, and only the
adapter imports need them.

---

[← Docs index](../README.md#documentation)
