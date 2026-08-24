import { capturedKeys, expand, get, has, substituteAsterisks } from './paths.ts';
import type { Check, Context } from './rules.ts';
import {
    checks,
    hasRequiredParams,
    IMPLICIT,
    isFileValue,
    NAMES_DEPENDENT_AT_ZERO,
    numeric,
} from './rules.ts';
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
interface PendingCheck {
    promise: Promise<boolean | 'undetermined'>;
    field: string;
    pattern: string;
    rule: string;
    params: Record<string, string>;
    attribute: string | null;
    value: unknown;
    ctx: Context;
}

/**
 * Per-instance extensions — the copy-on-write half of the §5.10 guarantee.
 * The built-in rule table is shared and read-only; an instance's extra
 * rules and message overrides ride in here and shadow at LOOKUP, so two
 * validators on one page can disagree about what `iban` means without
 * either mutating anything the other reads.
 */
export interface EngineOptions {
    rules?: Record<string, Check>;
    /** Message templates merged UNDER the schema's own (server wins). */
    messages?: Record<string, string>;
}

export function validate(values: Values, schema: Schema, options?: EngineOptions): Result {
    return run(values, withMessages(schema, options), undefined, options);
}

function withMessages(schema: Schema, options?: EngineOptions): Schema {
    if (options?.messages === undefined) return schema;

    return { ...schema, messages: { ...options.messages, ...schema.messages } };
}

/**
 * `validate`, but async checks are AWAITED rather than rounded trip — the
 * form runtime's entry point once `dimensions` (and, later, remote rules)
 * are in play. One deliberate difference from the sync engine's
 * one-failure-per-field presentation: rules after a pending async one have
 * already run by the time it resolves, so a field can carry a second
 * failure. The VERDICT is identical either way.
 */
export async function validateAsync(
    values: Values,
    schema: Schema,
    options?: EngineOptions,
): Promise<Result> {
    const pending: PendingCheck[] = [];
    const effective = withMessages(schema, options);
    const result = run(values, effective, pending, options);

    for (const entry of pending) {
        const verdict = await entry.promise;

        if (verdict === 'undetermined') {
            if (!result.undetermined.includes(entry.field)) result.undetermined.push(entry.field);
            continue;
        }

        if (!verdict) {
            result.failures.push({
                field: entry.field,
                rule: entry.rule,
                message: interpolate(
                    effective,
                    entry.pattern,
                    entry.rule,
                    entry.params,
                    entry.attribute,
                    entry.value,
                    entry.ctx,
                ),
            });
        }
    }

    return { ...result, valid: result.failures.length === 0 };
}

function run(
    values: Values,
    schema: Schema,
    pending: PendingCheck[] | undefined,
    options?: EngineOptions,
): Result {
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

            // The keys the pattern's wildcards matched for THIS field. Laravel
            // substitutes them into every rule parameter of the expanded
            // attribute (replaceAsterisksInParameters), which is what makes
            // `same:items.*.password_confirmation` mean this row's field.
            const keys = capturedKeys(pattern, field);

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
                pattern,
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

            for (const { rule, params: rawParams } of applicable) {
                // The wire carries params as an object for named rules and as a
                // JSON ARRAY for purely positional ones (PHP coerces
                // numeric-string keys to integers). Normalize once at this
                // boundary: an array becomes an index-keyed object, which reads
                // identically through Object.values() and named lookups — the
                // three functions below are typed on the object form, and the
                // published .d.ts was unsound while the union leaked through.
                let params: Record<string, string> = Array.isArray(rawParams)
                    ? Object.fromEntries(rawParams.map((value, index) => [String(index), value]))
                    : rawParams;

                if (keys.length > 0) {
                    params = Object.fromEntries(
                        Object.entries(params).map(([name, parameter]) => [
                            name,
                            substituteAsterisks(parameter, keys),
                        ]),
                    );
                }

                // A rule with no implementation must not silently pass: that is
                // the same lie as treating a server rule as valid. It becomes
                // undetermined instead. The widening cast is the lookup's honest
                // type: rule names come off the wire, not from the literal's keys.
                const check =
                    options?.rules?.[rule] ?? (checks as Record<string, Check | undefined>)[rule];

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

                const verdict = check(value, params, ctx);

                // An async answer: the sync engine cannot wait, so the field
                // rounds trip; validateAsync() collects it instead. Either
                // way a Promise is never truthiness-tested — that would pass
                // everything.
                if (verdict instanceof Promise) {
                    if (pending === undefined) {
                        if (!undetermined.includes(field)) undetermined.push(field);
                        continue;
                    }

                    pending.push({
                        promise: verdict,
                        field,
                        pattern,
                        rule,
                        params,
                        attribute: definition.attribute,
                        value,
                        ctx,
                    });
                    continue;
                }

                // 'undetermined' is the check saying "I cannot decide" — the
                // same honest answer an unknown rule gets, reached inside one.
                if (verdict === 'undetermined') {
                    if (!undetermined.includes(field)) undetermined.push(field);
                    continue;
                }

                if (!verdict) {
                    failures.push({
                        field,
                        rule,
                        message: interpolate(
                            schema,
                            pattern,
                            rule,
                            params,
                            definition.attribute,
                            value,
                            ctx,
                        ),
                    });

                    // One failure per field — a deliberate presentation
                    // choice, NOT Laravel's default: Laravel collects every
                    // failure per attribute unless `bail` opts out. The
                    // VERDICT is unaffected (any failure makes the field
                    // invalid either way); this only picks how much is shown,
                    // because a user fixes one thing at a time and five
                    // messages on one input is noise.
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
    const key =
        schema.messages[`${pattern}.${rule}`] !== undefined
            ? `${pattern}.${rule}`
            : `${ctx.field}.${rule}`;
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

    // A named `other` is a FIELD, so it is displayed the way a field is. The
    // conditional family may carry it positionally (key '0') instead.
    const dependent = params.other ?? (NAMES_DEPENDENT_AT_ZERO.has(rule) ? params['0'] : undefined);

    if (dependent !== undefined) {
        message = message.replaceAll(':other', displayable(dependent));
    }

    if (READS_DEPENDENT_VALUE.has(rule) && dependent !== undefined) {
        // Root resolution, like the rules themselves: the parameter reaching
        // here already carries the row's substituted index when it named a
        // wildcard path.
        return message.replaceAll(':value', displayValue(get(ctx.values, dependent)));
    }

    for (const [key, param] of Object.entries(params)) {
        message = message.replaceAll(`:${key}`, param);
    }

    // What is left is the variadic tail. Position 0 of a conditional rule is
    // the dependent FIELD, not a value — already spent on `:other` — so joining
    // every parameter rendered `required_unless:kind,card` as "unless kind is
    // in kind, card". A third-party schema writer may carry that field
    // POSITIONALLY (key '0') instead of under 'other', and it is just as much
    // the field there — drop both spellings for the conditional family.
    const tail = Object.entries(params)
        .filter(([key]) => key !== 'other' && !(NAMES_DEPENDENT_AT_ZERO.has(rule) && key === '0'))
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
    // An offset-checking replacer, not a lookbehind: a lookbehind in a
    // regex LITERAL is a parse-time SyntaxError on Safari < 16.4 — the
    // whole module fails to load, which is the worst possible failure
    // shape for a progressive-enhancement library (§12.4).
    return field
        .replace(/[A-Z]/g, (match, offset: number) => (offset === 0 ? match : `_${match}`))
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
