# Installation

The two halves install separately — the PHP exporter from the VCS repository, the JavaScript
runner from npm — and upgrade separately by design.

## Requirements

| Half | Requires |
|---|---|
| `laranail/validation-js` (PHP) | PHP `^8.4.1 \|\| ^8.5`, Laravel `^13.0` |
| `@laranail/validation-js` (npm) | Browsers: **Safari/iOS 15.4+, Chrome/Edge 93+, Firefox 92+**. Node `>= 18` to run the built ESM; `>= 22.6` only for developing the package itself. Zero runtime dependencies |

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

## Browser support and EOL policy

The declared floor (also in `package.json` `browserslist`) is set by `Object.hasOwn` —
Safari/iOS 15.4 (March 2022), Chrome/Edge 93, Firefox 92. The source deliberately contains no
regex lookbehinds: a lookbehind in a literal is a PARSE-time SyntaxError on older Safari, which
would fail the whole module rather than one rule. Beyond the floor, missing APIs degrade per
rule — `Intl.supportedValuesOf` (the `timezone` rule) is guarded and falls back to
undetermined, never a crash. The PHP half supports PHP `^8.4.1 || ^8.5` on Laravel `^13.0`;
both floors move only in a major, and a Laravel major is adopted within one minor of the
family's `laranail/package-tools` supporting it.

---

[← Docs index](../README.md#documentation)
