import { checks, IMPLICIT, isEmpty } from './rules.ts';
import type { Context } from './rules.ts';
import type { Failure, Result, Schema, Values } from './types.ts';

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

    for (const [field, definition] of Object.entries(schema.fields)) {
        if (definition.server.length > 0) {
            undetermined.push(field);
        }

        const value = values[field];
        const rules = definition.client;

        // `nullable` and `sometimes` are structural: they decide whether the
        // OTHER rules run at all, so they are resolved before the loop rather
        // than checked in it.
        const nullable = rules.some((r) => r.rule === 'nullable');
        const sometimes = rules.some((r) => r.rule === 'sometimes');

        // Whether a size rule means "length" or "value" is decided by the
        // RULE SET, not by whether the value looks numeric: `max:5` passes for
        // "6" because the size is the string length, and adding `numeric`
        // makes the same input fail.
        const ctx: Context = {
            values,
            field,
            numericField: rules.some((r) => ['numeric', 'integer', 'decimal'].includes(r.rule)),
        };

        if (sometimes && !(field in values)) continue;

        // An empty value does NOT skip every rule. Laravel runs its implicit
        // rules regardless — `accepted` on '' fails, it does not pass — and
        // treating empty as "nothing to check" was wrong in exactly that way.
        const empty = isEmpty(value);
        const applicable = empty ? rules.filter((r) => IMPLICIT.has(r.rule)) : rules;

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

            if (nullable && empty && !IMPLICIT.has(rule)) continue;

            if (!check(value, params, ctx)) {
                failures.push({
                    field,
                    rule,
                    message: interpolate(schema, field, rule, params, definition.attribute),
                });

                // One failure per field, matching Laravel's default bail-per-
                // attribute behaviour: a user fixes one thing at a time, and
                // five messages on one input is noise.
                break;
            }
        }
    }

    return { valid: failures.length === 0, failures, undetermined };
}

/** Fill `:attribute` and the rule's own `:placeholders` into a message. */
export function interpolate(
    schema: Schema,
    field: string,
    rule: string,
    params: Record<string, string>,
    attribute: string | null,
): string {
    const template = schema.messages[`${field}.${rule}`];
    const name = attribute ?? field.replace(/[_.]/g, ' ');

    if (template === undefined) {
        // No exported message. A generic one beats an empty string, and beats
        // inventing Laravel's wording for a rule whose message was not sent.
        return `The ${name} field is invalid.`;
    }

    let message = template.replaceAll(':attribute', name);

    for (const [key, value] of Object.entries(params)) {
        message = message.replaceAll(`:${key}`, value);
    }

    // `:values` is Laravel's spelling for the joined list in in/not_in.
    return message.replaceAll(':values', Object.values(params).join(', '));
}
