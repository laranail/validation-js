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
     * @return array{version: int, fields: array<string, array{attribute: string|null, client: list<array{rule: string, params: array<array-key, string>}>, server: list<string>}>, messages: array<string, string>}
     */
    public function export(array $rules, array $messages = [], array $attributes = []): array
    {
        $parser = new ValidationRuleParser([]);
        $fields = [];
        $exportedMessages = [];

        foreach ($rules as $attribute => $rule) {
            $attribute = (string) $attribute;
            $client = [];
            $server = [];

            foreach ($this->explode($parser, $attribute, $rule) as [$name, $parameters]) {
                $snake = self::snake($name);

                if (RuleCatalogue::isClientCheckable($snake)) {
                    $client[] = [
                        'rule' => $snake,
                        'params' => RuleCatalogue::nameParameters($snake, $parameters),
                    ];

                    $message = $this->message($attribute, $snake, $messages, $attributes);

                    if ($message !== null) {
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
            'version' => 1,
            'fields' => $fields,
            'messages' => $exportedMessages,
        ];
    }

    /**
     * @param  array<string, mixed>  $rules
     * @param  array<string, string>  $messages
     * @param  array<string, string>  $attributes
     */
    public function toJson(array $rules, array $messages = [], array $attributes = []): string
    {
        return json_encode($this->export($rules, $messages, $attributes), JSON_THROW_ON_ERROR);
    }

    /**
     * @return list<array{0: string, 1: list<string>}>
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
                $advertised = self::advertisedClientRule($single);

                if ($advertised !== null) {
                    $exploded[] = [$advertised['rule'], $advertised['params']];

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
     * A rule's own browser-equivalent form, if it advertises one.
     *
     * `interface_exists` rather than a hard dependency: laranail/validation is
     * a suggest, not a require, and this package is useful without it. A
     * consumer who has not installed it simply has no rule objects that could
     * advertise anything.
     *
     * @return array{rule: string, params: list<string>}|null
     */
    private static function advertisedClientRule(object $rule): ?array
    {
        if (! interface_exists(ClientCheckable::class) || ! $rule instanceof ClientCheckable) {
            return null;
        }

        $advertised = $rule->clientRule();

        if ($advertised === null) {
            return null;
        }

        // Only names the runner implements. A rule inventing its own would be
        // exported and then silently do nothing, which is the failure mode the
        // server default exists to prevent.
        if (! RuleCatalogue::isClientCheckable($advertised['rule'])) {
            return null;
        }

        return ['rule' => $advertised['rule'], 'params' => array_values($advertised['params'])];
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
     * @param  array<string, string>  $messages
     * @param  array<string, string>  $attributes
     */
    private function message(string $attribute, string $rule, array $messages, array $attributes): ?string
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

        // A size rule has four variants keyed by the value's type. The browser
        // decides which applies, so the string form is exported as the
        // default — anything else would require the exporter to know the input
        // type, which it does not.
        if (is_array($line)) {
            $line = $line['string'] ?? reset($line);
        }

        if (! is_string($line) || $line === $key) {
            return null;
        }

        return str_replace(':attribute', $attributes[$attribute] ?? str_replace('_', ' ', $attribute), $line);
    }
}
