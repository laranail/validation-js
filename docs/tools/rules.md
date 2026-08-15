# Rules

## What runs in the browser

Presence (`required`, `filled`, `present`, `nullable`, `sometimes`), types (`array`, `boolean`,
`integer`, `numeric`, `string`, `json`), size (`between`, `digits`, `digits_between`, `max`,
`min`, `size`), format (`alpha`, `alpha_dash`, `alpha_num`, `ascii`, `email`, `hex_color`, `ip`,
`ipv4`, `ipv6`, `lowercase`, `mac_address`, `regex`, `not_regex`, `ulid`, `uppercase`, `url`,
`uuid`), sets (`in`, `not_in`), cross-field (`accepted`, `confirmed`, `declined`, `different`,
`same`, `gt`, `gte`, `lt`, `lte`), substring (`contains`, `doesnt_contain`, `ends_with`,
`starts_with`, and their `doesnt_` forms), and numeric (`decimal`, `multiple_of`).

## What does not, and why

| Rule | Needs |
|---|---|
| `unique`, `exists` | the database |
| `active_url` | DNS |
| `current_password` | the session and a hash comparison |
| `dimensions`, `image`, `mimes`, `mimetypes`, `extensions`, `file` | to read the file, which a browser can only approximate from a name |

These are listed explicitly rather than merely omitted, because each is a case where a naive
reading would put it on the client and be wrong.

Everything else absent from the client list is also server-side, including rules that do not
exist. See [Schema](../schema.md#client-and-server).

## Four places the browser must match Laravel exactly

Each of these was wrong in the first implementation and was caught by the differential test,
not by review.

**`email` does not require a TLD.** Laravel's default is egulias `RFCValidation`, which accepts
`a@b`. A stricter browser check rejects input the server accepts — the worst direction, because
the user cannot proceed and nothing tells them why.

**A size rule's unit comes from the RULE SET, not the value.** `max:5` passes for `"6"` because
without a numeric rule the size is the string length. Add `numeric` and the same input fails.
Deciding from whether the value *looks* numeric gets it backwards.

**`contains` is an array rule.** It asks whether the attribute array contains the given values.
`contains:foo` fails for the string `'a foo b'`, which is the opposite of what the name
suggests.

**An empty value does not skip every rule.** Laravel runs its implicit rules regardless:
`accepted` on `''` fails rather than being skipped.

## Wildcards

A schema field key is a **pattern**, not a key. `items.*.email` never appears in the submitted
data: the runner expands it against what was actually sent and checks each concrete path, and a
failure names that path — `items.1.email`, not `items.*.email`.

An empty or absent collection expands to **nothing**, so `items.*.email => required` passes for
`{"items": []}`. Laravel behaves the same way: there is no item, so there is no field to
require.

Nested wildcards work: `rows.*.cols.*.v` expands the second only once the first is concrete.

Cross-field rules resolve **within the row first**. Inside `items.0.password`, a
`same:password_confirmation` means the sibling in that row, walking outward only if no such
sibling exists. Resolving at the top level would compare every row against one shared field,
which is not what the form means.

> The expansion happens in the browser, not at export time, because the exporter describes a
> rule SET rather than one submission — it has no data to expand against. Letting Laravel's
> parser expand it there produced a field with an empty rule list, which the runner then read
> as "nothing to check".

## A PHP regex that JavaScript cannot express

`regex:` patterns are translated from PCRE. When a pattern uses a construct JavaScript lacks —
possessive quantifiers, recursion, some lookbehind — the translation returns null and the rule
**passes** on the client. The server still checks it, and failing a valid value in the browser
is the worse error.

---

[← Docs index](../../README.md#documentation)
