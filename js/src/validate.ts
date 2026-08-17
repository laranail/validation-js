import { checks, hasRequiredParams, IMPLICIT, isFileValue, numeric } from './rules.ts';
import type { Context } from './rules.ts';
import { expand, get, has, sibling } from './paths.ts';
import type { Failure, Result, Schema, Values } from './types.ts';

/**
 * The schema MAJOR version this runner implements — `RuleExporter::VERSION`.
 *
 * Deliberately the only thing gated on, and it is not expected to move. Within a
 * major version every change to the format is additive: this runner ignores keys
 * it does not recognise, and degrades a rule it cannot fully evaluate to
 * undetermined rather than guessing. That is what lets the PHP half and this one
 * ship on their own schedules — an older runner against a newer exporter loses
 * precision on the parts it does not know about, and nothing else.
 *
 * See docs/schema.md, "Shipping the two halves apart".
 */
export const SCHEMA_VERSION = 1;

/**
 * Validate values against a schema exported from Laravel.
 *
 * The result is deliberately three-valued. A field can be invalid, valid, or
 * UNDETERMINED — carrying a rule only the server can decide. Collapsing the
 * third into "valid" is what makes client-side validation lie: it shows a
 * green tick for input the server will reject.
 */
export function validate(values: Values, schema: Schema): Result {
    const failures: Failure[] = [];
    const undetermined: string[] = [];

    // A different MAJOR version means the format was restructured in a way this
    // runner cannot read at all, so the whole schema goes to the server.
    //
    // This is the last resort and should stay unreached. Everything else — a
    // rule name this runner has never heard of, a parameter it cannot find, a
    // key added since it was published — degrades one rule to undetermined and
    // leaves the rest working. A version check that fired on every additive
    // change would make the two halves of this package a lockstep upgrade, and
    // there is nothing about a JSON document that requires that.
    if (schema.version !== SCHEMA_VERSION) {
        return {
            valid: true,
            failures: [],
            undetermined: Object.keys(schema.fields).flatMap((pattern) => expand(pattern, values)),
        };
    }

    for (const [pattern, definition] of Object.entries(schema.fields)) {
        // A field key is a PATTERN. `items.*.email` never appears in the data;
        // Laravel expands it against what was submitted and checks each
        // concrete path. An empty collection expands to nothing, which is why
        // `items.*.email => required` passes for `{items: []}`.
        for (const field of expand(pattern, values)) {
        const value = get(values, field);
        const rules = definition.client;

        // `nullable` and `sometimes` are structural: they decide whether the
        // OTHER rules run at all, so they are resolved before the loop rather
        // than checked in it.
        const nullable = rules.some((r) => r.rule === 'nullable');
        const sometimes = rules.some((r) => r.rule === 'sometimes');

        if (sometimes && !has(values, field)) continue;

        if (definition.server.length > 0 && !undetermined.includes(field)) {
            undetermined.push(field);
        }

        // Whether a size rule means "length" or "value" is decided by the
        // RULE SET, not by whether the value looks numeric: `max:5` passes for
        // "6" because the size is the string length, and adding `numeric`
        // makes the same input fail.
        const ctx: Context = {
            values,
            field,
            numericField: rules.some((r) => ['numeric', 'integer', 'decimal'].includes(r.rule)),
            arrayField: rules.some((r) => ['array', 'list'].includes(r.rule)),
        };

        // Which rules run at all. This mirrors Laravel's `isValidatable`, and
        // the distinction it draws is finer than "is the value empty":
        //
        //   - A BLANK STRING runs only the implicit rules. `accepted` on ''
        //     fails, it does not pass.
        //   - An ABSENT attribute runs only the implicit rules. That is what
        //     makes `required_without_all` fire on a payload with no keys.
        //   - A PRESENT attribute runs everything, even when its value is null
        //     or []. `integer` on null FAILS in Laravel, and `nullable` is the
        //     opt-out — the rule set says so, the value does not get to decide.
        //
        // Reading `null` and `[]` as "empty, so nothing to check" was wrong in
        // that last case, and wrong in the one direction that matters: the
        // browser showed a green tick for input the server then rejected.
        const blank = typeof value === 'string' && value.trim() === '';
        const runsEverything = !blank && has(values, field);
        const applicable = runsEverything ? rules : rules.filter((r) => IMPLICIT.has(r.rule));

        if (applicable.length === 0) continue;

        for (const { rule, params } of applicable) {
            // A rule with no implementation must not silently pass: that is
            // the same lie as treating a server rule as valid. It becomes
            // undetermined instead.
            const check = checks[rule];

            if (check === undefined) {
                if (!undetermined.includes(field)) undetermined.push(field);
                continue;
            }

            // The parameters this rule needs, which a schema written by a
            // different version of the exporter may not carry under the names
            // this runner reads. Guessing produces a VERDICT from missing data:
            // an absent `max` coerces to 0 and rejects every value. Undetermined
            // is the honest answer and costs a round trip.
            if (!hasRequiredParams(rule, params)) {
                if (!undetermined.includes(field)) undetermined.push(field);
                continue;
            }

            // `nullable` is what a rule set uses to say a present null is
            // acceptable — Laravel's `isNotNullIfMarkedAsNullable`. It is
            // narrower than it looks: only null, and only the non-implicit
            // rules, so a `required` alongside it still fires.
            if (nullable && value === null && !IMPLICIT.has(rule)) continue;

            if (!check(value, params, ctx)) {
                failures.push({
                    field,
                    rule,
                    message: interpolate(schema, pattern, rule, params, definition.attribute, value, ctx),
                });

                // One failure per field, matching Laravel's default bail-per-
                // attribute behaviour: a user fixes one thing at a time, and
                // five messages on one input is noise.
                break;
            }
        }
        }
    }

    return { valid: failures.length === 0, failures, undetermined };
}

/**
 * `required_if` and its relatives read `:value` as the dependent field's
 * CURRENT value — "required when kind is cheque" — not as the list of values
 * that would trigger it. `required_unless` is the other way round: its
 * `:values` IS the declared list. Laravel spells the difference out in
 * `replaceAcceptedIf` vs `replaceRequiredUnless`, and reading them alike
 * produced "required when kind is card, cheque" for a form that named one.
 */
const READS_DEPENDENT_VALUE = new Set([
    'required_if',
    'required_if_accepted',
    'required_if_declined',
]);

/**
 * The rules whose `:values` is a list of FIELD NAMES rather than values.
 * Laravel joins those with " / " and everything else with ", ".
 */
const LISTS_FIELDS = new Set([
    'required_with',
    'required_with_all',
    'required_without',
    'required_without_all',
]);

/** Fill `:attribute` and the rule's own `:placeholders` into a message. */
export function interpolate(
    schema: Schema,
    pattern: string,
    rule: string,
    params: Record<string, string>,
    attribute: string | null,
    value: unknown,
    ctx: Context,
): string {
    // Keyed by the PATTERN, not the expanded field. The exporter describes a
    // rule set and has no submission to expand against, so it can only key
    // `items.*.qty.required` — while the failure being reported is on
    // `items.0.qty`. Looking the concrete path up first found nothing, and
    // every wildcard field fell through to the generic message below with its
    // real one sitting unused in the schema.
    const key = schema.messages[`${pattern}.${rule}`] !== undefined ? `${pattern}.${rule}` : `${ctx.field}.${rule}`;
    const template = select(schema, key, rule, value, ctx);
    const name = attribute ?? displayable(ctx.field);

    if (template === undefined) {
        // No exported message. A generic one beats an empty string, and beats
        // inventing Laravel's wording for a rule whose message was not sent.
        return `The ${name} field is invalid.`;
    }

    let message = template.replaceAll(':attribute', name);

    // `:decimal` is one placeholder over two parameters — Laravel renders
    // `decimal:2` as "2" and `decimal:2,4` as "2-4". Composed before the named
    // pass, while `:min`/`:max` are still available to it.
    if (params.min !== undefined) {
        message = message.replaceAll(
            ':decimal',
            params.max === undefined ? params.min : `${params.min}-${params.max}`,
        );
    }

    // A named `other` is a FIELD, so it is displayed the way a field is.
    if (params.other !== undefined) {
        message = message.replaceAll(':other', displayable(params.other));
    }

    if (READS_DEPENDENT_VALUE.has(rule) && params.other !== undefined) {
        return message.replaceAll(':value', displayValue(get(ctx.values, sibling(ctx.field, params.other, ctx.values))));
    }

    for (const [key, param] of Object.entries(params)) {
        message = message.replaceAll(`:${key}`, param);
    }

    // What is left is the variadic tail. Position 0 of a conditional rule is
    // the dependent FIELD, not a value — already spent on `:other` — so joining
    // every parameter rendered `required_unless:kind,card` as "unless kind is
    // in kind, card".
    const tail = Object.entries(params)
        .filter(([key]) => key !== 'other')
        .map(([, param]) => (LISTS_FIELDS.has(rule) ? displayable(param) : param));

    const joined = tail.join(LISTS_FIELDS.has(rule) ? ' / ' : ', ');

    // `:values` first: `:value` is a prefix of it, so the other order truncates
    // it and leaves a stray "s".
    return message.replaceAll(':values', joined).replaceAll(':value', joined);
}

/**
 * Pick the variant of a size message that matches the value's type.
 *
 * Laravel's `getAttributeType`, including the part that is easy to miss:
 * gt/gte/lt/lte promote themselves to the numeric variant when the VALUE is
 * numeric (`shouldBeNumeric`), which is why `gt:5` on "4" says "must be greater
 * than 5." and not "…5 characters."
 */
function select(
    schema: Schema,
    key: string,
    rule: string,
    value: unknown,
    ctx: Context,
): string | undefined {
    const plain = schema.messages[key];
    const variants = schema.messageVariants?.[key];

    // `messages` is the fallback, not the exception. A schema written before
    // variants existed carries only that, and reading it is the correct answer
    // rather than a degraded one — it is the `string` variant, which is right
    // for every field that is not numeric, an array or a file.
    if (variants === undefined) return plain;

    const comparison = ['gt', 'gte', 'lt', 'lte'].includes(rule);
    const type =
        ctx.numericField || (comparison && numeric(value))
            ? 'numeric'
            : ctx.arrayField
              ? 'array'
              : isFileValue(value)
                ? 'file'
                : 'string';

    return variants[type] ?? variants.string ?? plain ?? Object.values(variants)[0];
}

/**
 * A field key as Laravel displays it: `str_replace('_', ' ', Str::snake($key))`.
 *
 * Dots survive, which is the point — a wildcard's concrete path reads as
 * "items.0.qty", the same string the server would have shown.
 */
function displayable(field: string): string {
    return field
        .replace(/(?<!^)([A-Z])/g, '_$1')
        .toLowerCase()
        .replaceAll('_', ' ');
}

/** Laravel's `getDisplayableValue`, minus the translation lookups a schema cannot carry. */
function displayValue(value: unknown): string {
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return 'empty';

    return String(value);
}
