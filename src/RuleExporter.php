<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

use Illuminate\Contracts\Translation\Translator;
use Illuminate\Contracts\Validation\Rule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\InvokableValidationRule;
use Illuminate\Validation\ValidationRuleParser;
use Simtabi\Laranail\Validation\Contracts\ClientCheckable;
use Stringable;

/**
 * Turns a Laravel rule set into the JSON schema the browser runner consumes.
 *
 * There is no rule-string parser here, deliberately.
 * {@see ValidationRuleParser} is Laravel's own, it already handles every input
 * shape — pipe strings, arrays, rule objects, `Rule::` builders — and a second
 * parser would be a second set of bugs that disagree with the framework in
 * exactly the cases nobody tests.
 *
 * The schema format is specified in `docs/schema.md`; both this class and the
 * JavaScript runner are implemented against that document.
 */
final readonly class RuleExporter
{
    /**
     * The schema format's MAJOR version, and the only thing a runner may gate on.
     *
     * It is 1, and the intention is that it stays 1. Within a major version
     * every change is ADDITIVE: a new top-level key, a new rule name, an extra
     * parameter. A runner from any era ignores what it does not recognise and
     * keeps deciding what it can, which is what lets the PHP half and the
     * JavaScript half ship on their own schedules with neither waiting for the
     * other.
     *
     * That is a constraint on this class, not a hope. Two changes have already
     * had to respect it:
     *
     * - The size parameters were renamed — `{"max":"255"}`, once
     *   `{"value":"255"}` — and both spellings travelled together while any
     *   runner might read the old one. The alias retired with the pre-1.0
     *   schema reset (no runner that wanted it was ever installable — J1
     *   predates every real consumer); the DISCIPLINE stands: rename by
     *   emitting both, retire an alias as the deliberate break it is.
     * - Size messages gained per-type variants. They went into a NEW
     *   `messageVariants` key rather than changing the type of `messages`, which
     *   an older runner calls `replaceAll()` on.
     *
     * Bump this only for a change that cannot be made additive — restructuring
     * `fields`, say. It costs every consumer a lockstep upgrade, so the bar is
     * "there is no additive way to express this", not "this is tidier".
     */
    public const int VERSION = 1;

    /**
     * Stands in for `*` while Laravel's parser runs. Any token works provided
     * it is a legal attribute segment and cannot collide with a real field
     * name — hence the underscores.
     */
    private const string WILDCARD_TOKEN = '__laranail_wildcard__';

    public function __construct(private ?Translator $translator = null) {}

    /**
     * @param  array<string, mixed>  $rules
     * @param  array<string, string>  $messages  Custom messages, `field.rule` or `field`.
     * @param  array<string, string>  $attributes  Human names for fields.
     * @param  list<string>  $except  Fields (or `items.*`-style patterns) exported as
     *                                server-only: their rule NAMES still travel, so the
     *                                runner reports them undetermined instead of green,
     *                                but nothing about them is evaluated client-side.
     * @return array{version: int, fields: array<string, array{attribute: string|null, client: list<array{rule: string, params: array<array-key, string>}>, server: list<string>}>, messages: array<string, string>, messageVariants: array<string, array<string, string>>}
     */
    public function export(array $rules, array $messages = [], array $attributes = [], array $except = []): array
    {
        $parser = new ValidationRuleParser([]);
        $fields = [];
        $exportedMessages = [];
        $exportedVariants = [];

        foreach ($rules as $attribute => $rule) {
            $attribute = (string) $attribute;
            $serverOnly = in_array($attribute, $except, true);
            $client = [];
            $server = [];

            foreach ($this->explode($parser, $attribute, $rule) as [$name, $parameters]) {
                $snake = self::snake($name);

                if (! $serverOnly && RuleCatalogue::isClientCheckable($snake)) {
                    $client[] = [
                        'rule' => $snake,
                        'params' => RuleCatalogue::nameParameters($snake, $parameters),
                    ];

                    $message = $this->message($attribute, $snake, $messages);

                    // A size rule's line has four variants keyed by the value's
                    // type. They travel in their own map, and `messages` keeps
                    // the string an older runner expects to call replaceAll on
                    // — changing the type in place would have thrown there.
                    if (is_array($message)) {
                        $exportedVariants["{$attribute}.{$snake}"] = $message;
                        $message = $message['string'] ?? reset($message);
                    }

                    if (is_string($message)) {
                        $exportedMessages["{$attribute}.{$snake}"] = $message;
                    }

                    continue;
                }

                // Everything else — including rules this package has never
                // heard of — round trips. See docs/schema.md.
                $server[] = $snake;
            }

            $fields[$attribute] = [
                'attribute' => $attributes[$attribute] ?? null,
                'client' => $client,
                'server' => array_values(array_unique($server)),
            ];
        }

        return [
            'version' => self::VERSION,
            'fields' => $fields,
            'messages' => $exportedMessages,
            'messageVariants' => $exportedVariants,
        ];
    }

    /**
     * @param  array<string, mixed>  $rules
     * @param  array<string, string>  $messages
     * @param  array<string, string>  $attributes
     */
    public function toJson(array $rules, array $messages = [], array $attributes = []): string
    {
        // The HEX flags are load-bearing: this JSON is written to be dropped
        // into an inline <script> block, where an unescaped "</script>" in a
        // translated message terminates the block early — stored XSS via a
        // translation string. Escaping is transport-only; the decoded values
        // are byte-identical.
        return json_encode(
            $this->export($rules, $messages, $attributes),
            JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP,
        );
    }

    /**
     * @return list<array{0: string, 1: array<array-key, string>}> Parameters keep
     *                                                             string keys when a ClientCheckable advertisement named
     *                                                             them; parser-derived parameters stay positional.
     */
    private function explode(ValidationRuleParser $parser, string $attribute, mixed $rule): array
    {
        // ValidationRuleParser::explode() EXPANDS wildcards against the
        // validator's data, and this exporter has none — it describes a rule
        // set, not one submission. Left alone, `items.*.qty` expands to
        // nothing and the field exports with an empty rule list, which the
        // browser then treats as "nothing to check".
        //
        // So the wildcard is hidden from the parser behind a token that is a
        // legal attribute name, and the pattern is kept as the schema key.
        // Expansion belongs to the runner, which has the actual data.
        $safe = str_replace('*', self::WILDCARD_TOKEN, $attribute);

        $parsed = $parser->explode([$safe => $rule]);
        $exploded = [];

        $all = $parsed->rules;

        if (! is_array($all)) {
            return [];
        }

        $forAttribute = $all[$safe] ?? [];

        if (! is_array($forAttribute)) {
            return [];
        }

        foreach ($forAttribute as $single) {
            // A rule OBJECT cannot normally be evaluated in a browser: its
            // logic is PHP that was never sent. Unless it says otherwise —
            // laranail/validation's ClientCheckable lets a rule advertise a
            // browser-equivalent form, and the rules that do return their OWN
            // pattern, so there is no second implementation to drift.
            // Laravel WRAPS a rule object in InvokableValidationRule during
            // explode(), so the object reaching here is the wrapper, not the
            // rule. Unwrapping first is what makes ClientCheckable reachable
            // at all — and without it the server name is the wrapper's
            // mangled FQN rather than the rule's.
            if ($single instanceof InvokableValidationRule) {
                $single = $single->invokable();
            }

            if ($single instanceof ValidationRule || $single instanceof Rule) {
                $advertised = self::advertisedClientRules($single);

                if ($advertised !== []) {
                    foreach ($advertised as $clientRule) {
                        $exploded[] = [$clientRule['rule'], $clientRule['params']];
                    }

                    continue;
                }

                // Named rather than dropped, so the field still round trips.
                // Dropping it would silently reduce the rule set the client
                // believes in.
                $exploded[] = [self::objectName($single), []];

                continue;
            }

            if (is_object($single)) {
                $single = $single instanceof Stringable ? (string) $single : $single::class;
            }

            if (! is_string($single)) {
                continue;
            }

            [$name, $parameters] = ValidationRuleParser::parse($single);

            if (! is_string($name) || $name === '') {
                continue;
            }

            $stringParameters = [];

            foreach (is_array($parameters) ? $parameters : [] as $parameter) {
                if (is_scalar($parameter)) {
                    $stringParameters[] = (string) $parameter;
                }
            }

            $exploded[] = [$name, $stringParameters];
        }

        return $exploded;
    }

    /**
     * A rule's own browser-equivalent rules, if it advertises any.
     *
     * A LIST, because a rule's browser form is not always one rule:
     * `Geo\Latitude` is `numeric` AND `between:-90,90`. All of them are
     * exported, and all must pass.
     *
     * Parameter keys are preserved: ClientCheckable documents NAMED keys,
     * and the name is the contract. Flattening them to a positional list
     * re-keyed each VALUE to whatever name sat at that position in the
     * catalogue table — a rule that wrote ['max' => …, 'min' => …] exported
     * inverted bounds.
     *
     * `interface_exists` rather than a hard dependency: laranail/validation is
     * a suggest, not a require, and this package is useful without it. A
     * consumer who has not installed it simply has no rule objects that could
     * advertise anything.
     *
     * @return list<array{rule: string, params: array<array-key, string>}>
     */
    private static function advertisedClientRules(object $rule): array
    {
        if (! interface_exists(ClientCheckable::class) || ! $rule instanceof ClientCheckable) {
            return [];
        }

        $exported = [];

        foreach ($rule->clientRules() as $advertised) {
            // Only names the runner implements. A rule inventing its own would
            // be exported and then silently do nothing, which is the failure
            // mode the server default exists to prevent — and it must take the
            // WHOLE advertisement with it, or the field would be checked
            // against a subset of its own rules and pass too easily.
            if (! RuleCatalogue::isClientCheckable($advertised['rule'])) {
                return [];
            }

            $exported[] = ['rule' => $advertised['rule'], 'params' => $advertised['params']];
        }

        return $exported;
    }

    private static function objectName(object $rule): string
    {
        return self::snake(class_basename($rule));
    }

    private static function snake(string $rule): string
    {
        // Laravel studly-cases rule names internally and snake-cases them for
        // messages; the schema uses the snake form throughout so the runner
        // and the message keys agree.
        return mb_strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $rule));
    }

    /**
     * The message template for a rule — never a finished sentence.
     *
     * `:attribute` is deliberately left in place. Substituting it here looks
     * harmless and is wrong for exactly one shape: a wildcard. The schema key
     * is the PATTERN (`items.*.qty`), the failure is reported on the concrete
     * path (`items.0.qty`), and baking the pattern into the sentence showed the
     * user "The items.*.qty field is required." The runner has the submission,
     * so it fills the name.
     *
     * @param  array<string, string>  $messages
     * @return string|array<string, string>|null
     */
    private function message(string $attribute, string $rule, array $messages): string|array|null
    {
        $custom = $messages["{$attribute}.{$rule}"] ?? $messages[$attribute] ?? null;

        if (is_string($custom)) {
            return $custom;
        }

        if (! $this->translator instanceof Translator) {
            return null;
        }

        $key = "validation.{$rule}";
        $line = $this->translator->get($key);

        // A size rule has four variants keyed by the value's TYPE, and which
        // one applies cannot be decided here. It depends on the rule set
        // (`numeric`, `array`), on the value (an uploaded file), and — for
        // gt/gte/lt/lte — on whether the value itself is numeric, which is
        // Laravel's `shouldBeNumeric` and runs at validation time. Exporting
        // the `string` variant as the default meant a numeric field was told
        // it "must not be greater than 5 characters". All four go, and the
        // runner picks.
        if (is_array($line)) {
            /** @var array<string, string> $variants */
            $variants = array_filter(
                $line,
                static fn (mixed $variant, mixed $type): bool => is_string($variant) && is_string($type),
                ARRAY_FILTER_USE_BOTH,
            );

            return $variants === [] ? null : $variants;
        }

        if (! is_string($line) || $line === $key) {
            return null;
        }

        return $line;
    }
}
