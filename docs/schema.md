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
        { "rule": "max", "params": { "value": "255" } }
      ],
      "server": ["unique"]
    }
  },
  "messages": {
    "email.required": "The :attribute field is required.",
    "email.max": "The :attribute may not be greater than :value characters."
  }
}
```

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

## `params` are named, not positional

Laravel passes rule parameters positionally: `between:1,5` arrives as `["1", "5"]`. The
exporter maps them to names — `{"min": "1", "max": "5"}` — so the runner and the message
interpolator read the same keys, and a rule whose parameter order changes upstream breaks
loudly in one place rather than silently shifting meaning.

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
