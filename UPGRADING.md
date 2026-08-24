# Upgrading

Breaking changes, and what to do about them. Versions not listed here need no action.

## The two packages do not upgrade together

This is the first thing to know, and it is the opposite of a warning.

`laranail/validation-js` on Packagist writes the schema; `@laranail/validation-js` on npm reads
it. **Upgrade either one on its own.** Neither waits for the other, no order is required, and
there is no window in which a form stops being checked because one half moved first.

That is a property of the format rather than a promise about release timing. Within a major
schema version every change is additive, and the runner is built to lose precision rather than
correctness when it meets something it cannot fully read:

| It meets | It does |
|---|---|
| a rule name it does not implement | reports that field undetermined |
| a parameter it cannot find | reports that **one rule** undetermined; the rest of the field is still decided |
| a top-level key added since it was published | ignores it |
| a different **major** schema version | sends the whole schema to the server |

The cost of a mismatch is a round trip on the parts one side does not understand. No combination
produces a wrong verdict, which is the only guarantee worth having in a package whose whole
premise is not lying to the user about what the server will accept.

The last row is the escape hatch, and it is reserved for a restructuring that cannot be expressed
additively. It has never been used. If it ever is, it appears here as a breaking change with the
upgrade order spelled out.

### If you are writing rules that extend this

The additive discipline is a constraint on the exporter, not a hope, and two changes have already
had to respect it:

- **Renaming a parameter.** `max:255` once carried `{"max": "255", "value": "255"}` — `value`
  was the first spelling, and both travelled while any runner might read it. The alias retired
  with the pre-1.0 schema reset (below); the discipline stands for every future rename: emit
  both names until the old runner is out of support, and treat retiring an alias as the
  breaking change it is.
- **Adding per-type messages.** A size rule's four variants went into a new `messageVariants` key
  rather than changing the type of `messages`, because a published runner calls `replaceAll()` on
  whatever `messages` holds — an object throws there, a key it has never heard of is ignored.

`tests/RuleExporterTest.php` pins these as wire-compatibility guards: every exported message is a
plain string, the clean schema carries no legacy alias, and no top-level key an earlier release
read has disappeared.

Full detail in [`docs/schema.md`](docs/schema.md#shipping-the-two-halves-apart).

## v1.0.0 - 2026-08-24

The SemVer graduation. From this release the [stability contract](README.md#stability) is
binding: stable surfaces break only in a major, deprecations live at least one minor, and the
wire schema's additive-forever promise starts here, at schema v1, from the clean format below.

**Nothing breaks between v0.2.0 and v1.0.0** — the transport tiers, the headless form, the
adapters, the bridges and the console commands are all additive. The entries below cover the
0.1 → 1.0 line as a whole for anyone arriving from a pre-0.2 build.

Two loosenings worth knowing, neither requiring action: `engines.node` is now `>= 18` (the
package ships built ESM; Node 22.6's type-stripping is only needed to develop the package
itself), and the browser floor is declared explicitly — Safari/iOS 15.4+, Chrome/Edge 93+,
Firefox 92+ (`browserslist`; see docs/installation.md).

### The wire schema is reset clean

The legacy `value` parameter alias on `max`/`min`/`size` is gone. It existed for a runner that
was never actually installable (J1 — the published package could not be imported), so nothing
real reads it; a schema key nothing reads is noise every future runner must tolerate. If you
wrote a third-party runner against the alias, read the modern names — they are the message
placeholders (`:max`, `:min`, `:size`).

### Cross-field references resolve from the root, as Laravel's do

`same:password_confirmation` inside `items.*` now reads the TOP-LEVEL field, exactly as
Laravel's `getValue()` does; the row-relative meaning is spelled
`same:items.*.password_confirmation`, whose asterisks are substituted with the row's own
indices. If a form relied on the runner's old row-first search, it was relying on a verdict
the server never agreed with. `sibling()` is gone from the public API; `capturedKeys()` and
`substituteAsterisks()` are the replacement primitives.

### Stricter, because Laravel is

`same`/`different`/`confirmed` compare strictly (an integer `1` is not `'1'`), `integer`
mirrors `FILTER_VALIDATE_INT` (no `'10.0'`, `'1e2'`, leading zeros, or beyond-PHP_INT-range),
`integer:strict`/`boolean:strict` are honoured, `url` treats protocol parameters as the exact
allow-list, and the comparison family reproduces `shouldBeNumeric`. Each change moves a
browser verdict onto the server's side of a previously measured disagreement — if input now
fails client-side, it was already failing server-side.

### The form runtime is additive

`createValidator`, `createHeadless`, the renderer/resolver/event surfaces and the `/regex`
subpath are all new API; nothing existing changed shape. The engine's `validate()` gained an
optional third options argument (per-instance rules and message fallbacks) — additive, and the
built-in rule table remains shared and read-only.

### Checks are three-valued and may be asynchronous

`Check` returns `boolean | 'undetermined' | Promise<...>`. The sync `validate()` treats a
Promise as undetermined; the new `validateAsync()` awaits it. Custom checks keep working
unchanged — `boolean` remains a valid return.

## v0.2.0 - 2026-08-23

The schema gained `messageVariants` and a second name on the size parameters, both additive; the
runner gained per-rule degradation when it cannot read a parameter. A runner and an exporter from
any combination of these releases work together.

### The npm package installs and imports (J1)

`main`/`exports` pointed at the raw `./js/src/index.ts`, which plain Node refuses to type-strip
under `node_modules` — the published package could not be imported at all outside a Vite-style
transpiling bundler. The package now ships compiled ESM + `.d.ts` under `dist/`, with a `types`
export condition. Nothing to change for a consumer who could not use it before; a bundler consumer
that deep-imported `./js/src/…` paths must import the package root instead (`dist` is the only
published directory).

### Verdict corrections a consumer could observe (J3, J4, J13)

- **Advertised parameter names are preserved (J3).** A `ClientCheckable` rule that named its
  parameters in a different order than the catalogue's positional table exported inverted values
  (`{"min":"90","max":"-90"}`) — the browser then rejected every in-range value. Named keys now
  travel as written.
- **`in`/`not_in` handle array values like Laravel (J4).** With an `array` rule the check is
  loose subset; without one an array value fails `in` and passes `not_in`. Stringifying the array
  produced a green tick for multi-selects Laravel rejects and a false block the other way.
- **Path reads see only own properties (J13).** A field or parameter path segment like
  `constructor` resolved through `Object.prototype` and read as present, firing presence
  conditionals on data that was never sent. Reads use `Object.hasOwn` now; negative array indices
  are out of bounds.

### `toJson()` output is inline-`<script>`-safe (J14)

The exporter's JSON now carries `JSON_HEX_TAG|APOS|QUOT|AMP` escapes, so a translated message
containing `</script>` cannot terminate the script block it is embedded in. Decoded values are
byte-identical; only the transport encoding changed. Nothing to change unless something parsed
the raw JSON with a tool that chokes on `<` escapes.
