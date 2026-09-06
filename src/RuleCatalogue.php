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
        // Dates — the shape set the runner documents; everything outside it
        // degrades to undetermined inside the checks themselves.
        'date', 'date_format', 'after', 'after_or_equal', 'before',
        'before_or_equal', 'date_equals', 'timezone',
        // The wider conditional-presence families — every dependent they
        // read is in the same submission the browser already holds.
        'accepted_if', 'declined_if',
        'prohibited', 'prohibited_if', 'prohibited_unless',
        'prohibited_if_accepted', 'prohibited_if_declined', 'prohibits',
        'missing', 'missing_if', 'missing_unless', 'missing_with', 'missing_with_all',
        'present_if', 'present_unless', 'present_with', 'present_with_all',
        // Collections
        'list', 'required_array_keys', 'max_digits', 'min_digits',
        'in_array', 'distinct',
        // File pre-flight — advisory: the runner fails the obviously-wrong
        // pick from name/declared-type/size and answers undetermined on a
        // match, because only the server reads the bytes.
        'file', 'mimes', 'extensions', 'image',
        // Async: decided in browsers by decoding the image; undetermined
        // where decoding is unavailable.
        'dimensions',
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
     * - `mimetypes` needs the sniffed content; the other file rules moved
     *   to the client as ADVISORY checks that fail fast and never
     *   green-tick (`dimensions` decodes the real image, asynchronously).
     *
     * @var list<string>
     */
    public const array SERVER = [
        'unique', 'exists', 'active_url', 'current_password', 'mimetypes',
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
        'between'        => ['min', 'max'],
        'digits'         => ['digits'],
        'digits_between' => ['min', 'max'],
        // Named for the PLACEHOLDER the message uses, not for the role the
        // parameter plays. `max:255`'s line reads ":max characters", so a
        // parameter called `value` interpolated nothing and the user was shown
        // a literal ":max". The check and the message have to read the same key
        // or one of the two is silently wrong, and it is always the message —
        // the check keeps working, so nothing fails to reveal it.
        'max'  => ['max'],
        'min'  => ['min'],
        'size' => ['size'],
        // `decimal` is the exception, and it is Laravel's exception rather than
        // one invented here: the check needs two bounds, the line has a single
        // `:decimal` that Laravel renders as "2" or "2-4". The runner composes
        // it from these two — see interpolate() in js/src/validate.ts.
        'decimal'     => ['min', 'max'],
        'multiple_of' => ['value'],
        'regex'       => ['pattern'],
        'not_regex'   => ['pattern'],
        'same'        => ['other'],
        'different'   => ['other'],
        'gt'          => ['value'],
        'gte'         => ['value'],
        'lt'          => ['value'],
        'lte'         => ['value'],
        // Only position 0 is named. These take a field and then a VARIADIC
        // list of values — `required_if:kind,card,cheque` — so naming the
        // second would imply there is exactly one.
        'required_if'            => ['other'],
        'required_unless'        => ['other'],
        'required_if_accepted'   => ['other'],
        'required_if_declined'   => ['other'],
        'confirmed'              => ['other'],
        'accepted_if'            => ['other'],
        'declined_if'            => ['other'],
        'prohibited_if'          => ['other'],
        'prohibited_unless'      => ['other'],
        'prohibited_if_accepted' => ['other'],
        'prohibited_if_declined' => ['other'],
        'missing_if'             => ['other'],
        'missing_unless'         => ['other'],
        'present_if'             => ['other'],
        'present_unless'         => ['other'],
        'max_digits'             => ['max'],
        'min_digits'             => ['min'],
        'in_array'               => ['other'],
        // Named for the `:date` placeholder their messages interpolate.
        'after'           => ['date'],
        'after_or_equal'  => ['date'],
        'before'          => ['date'],
        'before_or_equal' => ['date'],
        'date_equals'     => ['date'],
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
     * @param array<array-key, string> $parameters
     *
     * @return array<array-key, string> String keys for named rules; integer
     *                                  keys for variadic ones. See above.
     */
    public static function nameParameters(string $rule, array $parameters): array
    {
        $rule = mb_strtolower($rule);
        $names = self::PARAMETER_NAMES[$rule] ?? [];
        $named = [];
        $position = 0;

        foreach ($parameters as $key => $parameter) {
            // A string key IS the name — the rule author named it (the
            // ClientCheckable contract documents named keys). Renaming by
            // position bound each value to whatever name sat at that index
            // in the table, inverting min/max whenever the author's
            // insertion order differed from the table's.
            //
            // Positional entries are named from the table as before. The
            // (string) cast on the fallback keeps the TYPE honest for
            // readers; it does not change the wire — PHP coerces
            // numeric-string keys back to integers, which is exactly why
            // fully-positional rules serialise as a JSON ARRAY (see above)
            // and the runner normalises both shapes at its boundary.
            $name = is_string($key) ? $key : ($names[$position] ?? (string) $position);

            if (! is_string($key)) {
                $position++;
            }

            $named[$name] = $parameter;
        }

        return $named;
    }
}
