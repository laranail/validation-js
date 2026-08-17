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

- **Renaming a parameter.** `max:255` carries `{"max": "255", "value": "255"}` — `value` is what
  the first release called it. Both travel, so a runner from either era finds what it reads. See
  `RuleCatalogue::PARAMETER_ALIASES`; retire an alias only when the runner that needed it is out
  of support, and treat that as the breaking change it is.
- **Adding per-type messages.** A size rule's four variants went into a new `messageVariants` key
  rather than changing the type of `messages`, because a published runner calls `replaceAll()` on
  whatever `messages` holds — an object throws there, a key it has never heard of is ignored.

`tests/RuleExporterTest.php` pins these as wire-compatibility guards: every exported message is a
plain string, every renamed parameter is still reachable under its old name, and no top-level key
an earlier release read has disappeared.

Full detail in [`docs/schema.md`](docs/schema.md#shipping-the-two-halves-apart).

## Unreleased

Nothing requiring action. The schema gained `messageVariants` and a second name on the size
parameters, both additive; the runner gained per-rule degradation when it cannot read a parameter.
A runner and an exporter from any combination of these releases work together.
