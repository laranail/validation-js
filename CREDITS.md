# Credits

## Prior art

[`proengsoft/laravel-jsvalidation`](https://github.com/proengsoft/laravel-jsvalidation)
(MIT, copyright Albert Moreno) established the two ideas at the centre of this package:

- **A client allow-list with a server fallback**, where anything not on the list round trips.
  Its `RuleListTrait` carried a 75-entry client list, a 4-entry server list, and the policy
  `isRemoteRule($rule) = in_array($rule, $serverRules) || ! in_array($rule, $clientRules)` —
  unknown defaults to the server. That default is what makes such a design safe for arbitrary
  custom rules, and it is reproduced here.
- **A positional-to-named parameter table**, its `mapParams()`, encoding roughly thirty rules'
  worth of Laravel parameter semantics.

**No code was carried over.** Both are reimplemented from the behaviour, because a derivative
would inherit an attribution obligation this package does not need: the rule catalogue here is
shorter, the parameter table is smaller and differently keyed, and the schema is a different
format consumed by a different runtime.

That distinction is not hypothetical. An earlier in-house attempt at this problem —
`laranail/js-validation`, never published — WAS a 54–91% file-by-file derivative of that package
with its attribution stripped, which made it unpublishable until the notice was restored.

## Standards

| Behaviour | Reference |
|---|---|
| Rule parsing, parameter splitting | `Illuminate\Validation\ValidationRuleParser` — used directly, not reimplemented |
| Per-rule semantics | `Illuminate\Validation\Concerns\ValidatesAttributes`, verified by differential test |
