# Rules

## What runs in the browser

Presence (`required`, `filled`, `present`, `nullable`, `sometimes`), types (`array`, `boolean`,
`integer`, `numeric`, `string`, `json`), size (`between`, `digits`, `digits_between`, `max`,
`min`, `size`), format (`alpha`, `alpha_dash`, `alpha_num`, `ascii`, `email`, `hex_color`, `ip`,
`ipv4`, `ipv6`, `lowercase`, `mac_address`, `regex`, `not_regex`, `ulid`, `uppercase`, `url`,
`uuid`), sets (`in`, `not_in`), cross-field (`accepted`, `confirmed`, `declined`, `different`,
`same`, `gt`, `gte`, `lt`, `lte`), conditional presence (`required_if`,
`required_if_accepted`, `required_if_declined`, `required_unless`, `required_with`,
`required_with_all`, `required_without`, `required_without_all`), substring (`contains`, `doesnt_contain`, `ends_with`,
`starts_with`, and their `doesnt_` forms), and numeric (`decimal`, `multiple_of`).

## What does not, and why

| Rule | Needs |
|---|---|
| `unique`, `exists` | the database |
| `active_url` | DNS |
| `current_password` | the session and a hash comparison |
| `dimensions`, `image`, `mimes`, `mimetypes`, `extensions`, `file` | to read the file, which a browser can only approximate from a name |
| `exclude`, `exclude_if`, `exclude_unless`, `exclude_with`, `exclude_without` | a different result model — see below |

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

## Why `exclude_*` stays on the server

Every other rule answers pass or fail. `exclude_if` does something else: it removes the field
from `validated()` entirely, changing the SHAPE of the result rather than the verdict.

A runner that "supported" it would have to return a different data set, not a different answer
— and an application that trusted a client-side exclusion would submit a payload it believed
had been filtered. That is a larger change than a rule implementation, and faking it is worse
than routing it.

## Conditional presence

`required_if` and its family are decided in the browser, because every input they need — the
value of another field in the same submission — is already there. Sending them to the server
spends a round trip on the commonest dynamic-form case.

Two details worth knowing:

- **They are implicit rules.** Their whole job is to decide whether an *absent* field should
  have been there, so skipping them on an empty value would skip exactly the case they exist
  for.
- **`required_without` and `required_without_all` are not symmetrical with the `_with` pair.**
  `required_without:a,b` fires when ANY named field is missing; `required_without_all:a,b` only
  when ALL are. That asymmetry is Laravel's.

One limitation: Laravel converts `true`/`false` parameters when the dependent field is declared
`boolean`, and the schema does not carry that declaration. A boolean value is therefore compared
in both spellings rather than the declaration being guessed at.

## Rules from laranail/validation

A rule OBJECT normally routes to the server: its logic is PHP that was never sent. Rules
implementing `Contracts\ClientCheckable` are the exception — they advertise their **own
pattern**, which the exporter ships as a `regex` or `not_regex` rule.

Today that is `Slug`, `WithoutSpaces`, `SemVer`, `Subdomain` and `EthereumAddress`.

The contract returns a rule name and parameters rather than a JavaScript implementation, and
that is the point: a hand-written twin of every rule would drift from the PHP one and disagree
with the server in the cases nobody tested.

**No rule performing a checksum, a query or IO advertises one, and none should.** A shape-only
pattern for an IBAN would pass a mistyped account number in the browser and fail it on the
server — the precise failure this whole design avoids. Both packages carry tests asserting
those rules stay server-side.

Two things had to be right for this to work at all, and both fail safe:

- Laravel **wraps** a rule object in `InvokableValidationRule` during `explode()`, so the
  exporter unwraps before looking for the contract. Without that the contract is unreachable
  and the server name is the wrapper's mangled FQN rather than the rule's.
- An advertised rule name the runner does not implement is **ignored**, and the rule routes to
  the server as usual.

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
