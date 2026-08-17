<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

/**
 * Which rules the browser can decide, and what their parameters are called.
 *
 * Reimplemented from the behaviour of `proengsoft/laravel-jsvalidation`'s
 * `RuleListTrait` and `mapParams()`, which established both ideas. No code was
 * carried over — that package is MIT and a derivative would inherit its
 * attribution obligation, and the useful part is the SPECIFICATION rather than
 * the implementation.
 *
 * @internal
 */
final class RuleCatalogue
{
    /**
     * Rules a browser can decide on its own.
     *
     * Everything absent from this list is treated as server-only, INCLUDING
     * rules that do not exist. That default is the safety property: a custom
     * rule, a package rule, or one added by a future Laravel version is
     * something the browser cannot evaluate, and calling an unknown rule
     * "passed" shows a green tick for input the server will reject.
     *
     * @var list<string>
     */
    public const array CLIENT = [
        // Presence
        'required', 'filled', 'present', 'nullable', 'sometimes',
        // Type
        'array', 'boolean', 'integer', 'numeric', 'string', 'json',
        // Size — meaning depends on the value's type, resolved at check time
        'between', 'digits', 'digits_between', 'max', 'min', 'size',
        // Format
        'alpha', 'alpha_dash', 'alpha_num', 'ascii', 'email', 'hex_color',
        'ip', 'ipv4', 'ipv6', 'lowercase', 'mac_address', 'regex', 'not_regex',
        'ulid', 'uppercase', 'url', 'uuid',
        // Comparison against a set
        'in', 'not_in',
        // Comparison against another field
        'accepted', 'confirmed', 'declined', 'different', 'same',
        'gt', 'gte', 'lt', 'lte',
        // Conditional presence. These decide whether the field is required
        // from OTHER fields in the same submission, all of which the browser
        // already has — which is what makes them worth doing here rather than
        // spending a round trip on the commonest dynamic-form case.
        'required_if', 'required_if_accepted', 'required_if_declined',
        'required_unless', 'required_with', 'required_with_all',
        'required_without', 'required_without_all',
        // Substring
        'contains', 'doesnt_contain', 'doesnt_end_with', 'doesnt_start_with',
        'ends_with', 'starts_with',
        // Numeric
        'decimal', 'multiple_of',
    ];

    /**
     * Rules that are explicitly server-only even though they look decidable.
     *
     * Listed rather than merely omitted, because each is a case where a naive
     * reading would put it on the client and be wrong:
     *
     * - `unique` / `exists` need the database.
     * - `active_url` needs DNS.
     * - `current_password` needs the session and a hash comparison.
     * - `dimensions` / `image` / `mimes` / `mimetypes` / `extensions` need to
     *   read the file, which the browser can only approximate from a name.
     *
     * @var list<string>
     */
    public const array SERVER = [
        'unique', 'exists', 'active_url', 'current_password',
        'dimensions', 'image', 'mimes', 'mimetypes', 'extensions', 'file',
    ];

    /**
     * Positional parameters mapped to names.
     *
     * Laravel passes parameters positionally, so `between:1,5` arrives as
     * `["1", "5"]`. Naming them means the runner and the message interpolator
     * read the same keys, and a rule whose parameter order changes upstream
     * breaks loudly in one place instead of quietly shifting meaning.
     *
     * A rule absent from this table keeps positional keys `0`, `1`, … — which
     * is correct for the variadic ones (`in`, `starts_with`), where there is
     * no meaningful name for the third value.
     *
     * Note what that means on the wire: PHP coerces the numeric-string keys to
     * integers, so a variadic rule's params serialise as a JSON ARRAY while a
     * named rule's serialise as an object. The runner reads both — it takes
     * `Object.values()` — and `docs/schema.md` says so. Forcing an object here
     * would mean emitting `{"0":…}`, which is not more honest, only more
     * surprising.
     *
     * @var array<string, list<string>>
     */
    public const array PARAMETER_NAMES = [
        'between' => ['min', 'max'],
        'digits' => ['digits'],
        'digits_between' => ['min', 'max'],
        // Named for the PLACEHOLDER the message uses, not for the role the
        // parameter plays. `max:255`'s line reads ":max characters", so a
        // parameter called `value` interpolated nothing and the user was shown
        // a literal ":max". The check and the message have to read the same key
        // or one of the two is silently wrong, and it is always the message —
        // the check keeps working, so nothing fails to reveal it.
        'max' => ['max'],
        'min' => ['min'],
        'size' => ['size'],
        // `decimal` is the exception, and it is Laravel's exception rather than
        // one invented here: the check needs two bounds, the line has a single
        // `:decimal` that Laravel renders as "2" or "2-4". The runner composes
        // it from these two — see interpolate() in js/src/validate.ts.
        'decimal' => ['min', 'max'],
        'multiple_of' => ['value'],
        'regex' => ['pattern'],
        'not_regex' => ['pattern'],
        'same' => ['other'],
        'different' => ['other'],
        'gt' => ['value'],
        'gte' => ['value'],
        'lt' => ['value'],
        'lte' => ['value'],
        // Only position 0 is named. These take a field and then a VARIADIC
        // list of values — `required_if:kind,card,cheque` — so naming the
        // second would imply there is exactly one.
        'required_if' => ['other'],
        'required_unless' => ['other'],
        'required_if_accepted' => ['other'],
        'required_if_declined' => ['other'],
        'confirmed' => ['other'],
    ];

    /**
     * Names an older runner reads, emitted alongside the current ones.
     *
     * Keyed rule => [current name => legacy name]. Schema version 1 called all
     * three size bounds `value`; they are now named for the placeholder their
     * message uses, which is what makes the message interpolate. Both travel,
     * so a runner from either era finds what it looks for.
     *
     * @var array<string, array<string, string>>
     */
    public const array PARAMETER_ALIASES = [
        'max' => ['max' => 'value'],
        'min' => ['min' => 'value'],
        'size' => ['size' => 'value'],
    ];

    public static function isClientCheckable(string $rule): bool
    {
        $rule = mb_strtolower($rule);

        // Server list wins over the client list. Both are consulted rather
        // than trusting the omission, so adding a rule to CLIENT by mistake
        // cannot silently move a database check into the browser.
        return ! in_array($rule, self::SERVER, true) && in_array($rule, self::CLIENT, true);
    }

    /**
     * @param  list<string>  $parameters
     * @return array<array-key, string> String keys for named rules; integer
     *                                  keys for variadic ones. See above.
     */
    public static function nameParameters(string $rule, array $parameters): array
    {
        $rule = mb_strtolower($rule);
        $names = self::PARAMETER_NAMES[$rule] ?? [];
        $named = [];

        foreach (array_values($parameters) as $index => $parameter) {
            // Keys are forced to strings: an integer key would make the
            // schema's JSON object serialise as an ARRAY on round trip, and
            // the runner reads params as an object.
            $name = $names[$index] ?? (string) $index;
            $named[$name] = $parameter;

            // The same value under the name an older runner looks for.
            //
            // This is what lets the two halves ship separately. Renaming a
            // parameter is invisible on the wire — a runner that reads a key
            // which is no longer there gets `undefined`, and the interesting
            // question is what it does next. Emitting both means it never has
            // to find out: the old name keeps working for as long as anyone is
            // running the old code, and the entry costs a handful of bytes.
            //
            // Retire an alias only when the runner that needed it is out of
            // support, and treat that as the breaking change it is.
            $legacy = self::PARAMETER_ALIASES[$rule][$name] ?? null;

            if ($legacy !== null) {
                $named[$legacy] = $parameter;
            }
        }

        return $named;
    }
}
