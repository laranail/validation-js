# Schema

The contract between the PHP exporter and the JavaScript runner. Both halves are implemented
against this document; if they disagree, this is what is right.

```json
{
  "version": 1,
  "fields": {
    "email": {
      "attribute": "Email address",
      "client": [
        { "rule": "required", "params": {} },
        { "rule": "email", "params": {} },
        { "rule": "max", "params": { "max": "255", "value": "255" } }
      ],
      "server": ["unique"]
    }
  },
  "messages": {
    "email.required": "The :attribute field is required.",
    "email.max": "The :attribute field must not be greater than :max characters."
  },
  "messageVariants": {
    "email.max": {
      "numeric": "The :attribute field must not be greater than :max.",
      "file": "The :attribute field must not be greater than :max kilobytes.",
      "string": "The :attribute field must not be greater than :max characters.",
      "array": "The :attribute field must not have more than :max items."
    }
  }
}
```

## Shipping the two halves apart

The PHP exporter and the JavaScript runner are separate packages on separate
registries, and they are meant to be upgraded separately. Nothing here requires a
lockstep release, and the format is constrained so it stays that way.

**`version` is a MAJOR version only, and it is 1.** A runner refuses a major it
does not implement — the whole schema becomes undetermined and the server
decides — but that is the last resort, and it is not expected ever to fire.

**Within a major version, every change is additive.** A new top-level key, a new
rule name, an extra parameter. Three rules make that hold:

1. **A runner ignores what it does not recognise.** An unknown top-level key, an
   unknown rule name — neither disturbs the rules it does understand.
2. **A runner never guesses a missing parameter.** If a check cannot find what it
   needs, that ONE rule becomes undetermined. This is the guard that matters:
   without it, an absent `max` coerces to `0` and the rule silently becomes "no
   value is shorter than nothing", rejecting everything. A wrong verdict from
   missing data is worse than a round trip, and it is invisible.
3. **A renamed key is emitted under both names.** `max:255` carries
   `{"max": "255", "value": "255"}` — `value` is what the first release called
   it. The alias costs a handful of bytes and is retired only when the runner
   that needed it is out of support.

So the four combinations behave like this:

| | Old runner | New runner |
|---|---|---|
| **Old schema** | as it always did | rules it can read fully are decided; the rest round trip |
| **New schema** | additive keys ignored, aliases found, still correct | everything decided |

The cost of a mismatch is precision, never correctness: some fields round trip
that need not have. No combination produces a wrong verdict, which is the only
guarantee worth having here.

> **What a major bump would cost.** Every consumer upgrading both packages
> together, in the right order, or losing all client-side checking in between.
> The bar is "there is no additive way to express this" — restructuring `fields`,
> say — not "this is tidier". The two changes that have come up so far, renaming
> the size parameters and adding per-type messages, were both done additively.

## `client` and `server`

Every rule lands in exactly one of them.

`client` rules are checked in the browser. `server` rules cannot be — they need the database,
the network, or state the browser does not have — so the runner reports the field as
**undetermined** rather than valid, and the form still submits for the real answer.

**A rule the exporter does not recognise goes to `server`.** That default is the whole safety
property: a custom rule, a package rule, or a rule added by a future Laravel version is
something the browser cannot evaluate, and treating an unknown rule as "passes" would show a
user a green tick for input the server will reject. The cost of the safe default is a round
trip; the cost of the unsafe one is a lie.

### What the schema deliberately does not say

**Server rules travel as a bare name — their parameters are stripped, and that is a
guarantee, not an accident.** A schema ships to every browser that loads the form, so
`unique:users,email` exporting as anything but `"unique"` would hand out table names, column
names, and the shape of a database check as reconnaissance. The exporter strips server-rule
parameters unconditionally, and a regression test locks the whole serialized schema against
containing them.

Know what the schema still does say: **field names, client-rule parameters, and any `regex:`
pattern are public the moment they reach a browser.** A pattern that encodes something
sensitive — an internal code format, a customer-tier convention — belongs in a server-side
rule, where only its name travels.

## `messages` are templates, keyed by the field PATTERN

Two things about a message are easy to get wrong, and both are wrong silently.

**`:attribute` is not filled in by the exporter.** A schema key is a pattern, so
`items.*.qty` is the only name the exporter has — while the failure is reported on
`items.0.qty`. Baking the pattern into the sentence produced "The items.\*.qty field is
required." The runner fills the name, using `attribute` when the field has a human label and
otherwise the concrete path, the way Laravel's `getDisplayableAttribute` does.

**A size rule's variants live in `messageVariants`, beside `messages`.** `max`, `min`, `size`,
`between`, `gt`, `gte`, `lt` and `lte` each have four, keyed by the value's type. Which one
applies cannot be decided at export time: it depends on the rule set (`numeric`, `array`), on the
value (an uploaded file), and — for the four comparisons — on whether the value itself is
numeric, which is Laravel's `shouldBeNumeric` and runs during validation. So all four travel and
the runner picks. Exporting only the `string` variant told a numeric field it "must not be
greater than 5 characters".

They are a separate key rather than a change to `messages`, and that is the additive rule from
the top of this page doing its job: a runner calls `replaceAll()` on whatever `messages` holds,
so handing it an object throws, while a key it has never heard of is simply ignored. `messages`
still carries the `string` variant, which is the right sentence for every field that is not
numeric, an array or a file.

A **custom** message is always a plain string: the caller wrote one sentence and means it for
every type.

## `params` are named, not positional

Laravel passes rule parameters positionally: `between:1,5` arrives as `["1", "5"]`. The
exporter maps them to names — `{"min": "1", "max": "5"}` — so the runner and the message
interpolator read the same keys, and a rule whose parameter order changes upstream breaks
loudly in one place rather than silently shifting meaning.

**The name is the message's placeholder, not the parameter's role.** `max:255` carries
`{"max": "255"}` rather than `{"value": "255"}`, because the line reads ":max characters" and a
key that does not match interpolates nothing — leaving a literal `:max` on screen. The check
and the message must read the same key or one of the two is silently wrong, and it is always
the message, because the check keeps working.

`decimal` is the one exception, and it is Laravel's: the check needs two bounds
(`{"min": "2", "max": "4"}`) while the line has a single `:decimal` that renders as "2" or
"2-4". The runner composes it.

**Variadic rules keep positions, and therefore arrive as a JSON array.** `in:a,b,c` has no
meaningful name for its third value, so its params are `["a", "b", "c"]` rather than
`{"0":"a", …}` — PHP coerces numeric-string keys to integers, and emitting `{"0":…}` would be
more surprising, not more honest. The runner reads params with `Object.values()`, which handles
both shapes.

## Values are strings

Parameters stay as Laravel parsed them. `max:255` carries `"255"`, not `255`. The runner
coerces at the point of comparison, because what `255` means depends on the rule — a character
count for a string, a value for a number, kilobytes for a file — and deciding that during
export would bake in an assumption the exporter cannot check.

---

[← Docs index](../README.md#documentation)
