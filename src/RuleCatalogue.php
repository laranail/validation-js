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
        'max' => ['value'],
        'min' => ['value'],
        'size' => ['value'],
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
        'required_if' => ['other', 'value'],
        'required_unless' => ['other', 'value'],
        'confirmed' => ['other'],
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
        $names = self::PARAMETER_NAMES[mb_strtolower($rule)] ?? [];
        $named = [];

        foreach (array_values($parameters) as $index => $parameter) {
            // Keys are forced to strings: an integer key would make the
            // schema's JSON object serialise as an ARRAY on round trip, and
            // the runner reads params as an object.
            $named[$names[$index] ?? (string) $index] = $parameter;
        }

        return $named;
    }
}
