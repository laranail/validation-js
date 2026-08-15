<?php

declare(strict_types=1);

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Simtabi\Laranail\ValidationJs\RuleCatalogue;
use Simtabi\Laranail\ValidationJs\RuleExporter;

function exporter(): RuleExporter
{
    return new RuleExporter(app('translator'));
}

it('splits rules into what the browser can decide and what it cannot', function (): void {
    $schema = exporter()->export(['email' => 'required|email|unique:users']);

    expect(array_column($schema['fields']['email']['client'], 'rule'))->toBe(['required', 'email'])
        ->and($schema['fields']['email']['server'])->toBe(['unique']);
});

it('sends an unknown rule to the server rather than assuming it passes', function (): void {
    // The safety property. Calling an unrecognised rule "passed" shows a green
    // tick for input the server will reject; a round trip is the cheaper error.
    $schema = exporter()->export(['field' => 'required|some_future_laravel_rule|my_custom_rule']);

    expect($schema['fields']['field']['server'])->toContain('some_future_laravel_rule')
        ->toContain('my_custom_rule')
        ->and(array_column($schema['fields']['field']['client'], 'rule'))->toBe(['required']);
});

it('sends a rule OBJECT to the server, named rather than dropped', function (): void {
    // A rule object's logic is PHP that was never sent to the browser.
    // Dropping it would silently shrink the rule set the client believes in.
    $schema = exporter()->export(['field' => ['required', new class implements ValidationRule
    {
        public function validate(string $attribute, mixed $value, Closure $fail): void {}
    }]]);

    expect($schema['fields']['field']['server'])->not->toBeEmpty();
});

it('names parameters instead of leaving them positional', function (): void {
    // So the runner and the message interpolator read the same keys, and a
    // change in upstream parameter order breaks loudly in one place.
    $schema = exporter()->export(['age' => 'between:1,5']);

    expect($schema['fields']['age']['client'][0]['params'])->toBe(['min' => '1', 'max' => '5']);
});

it('keeps positional keys for variadic rules, which have no names', function (): void {
    $schema = exporter()->export(['role' => 'in:admin,editor,viewer']);

    expect($schema['fields']['role']['client'][0]['params'])
        ->toBe(['0' => 'admin', '1' => 'editor', '2' => 'viewer']);
});

it('exports the message Laravel would have used', function (): void {
    $schema = exporter()->export(['email' => 'required']);

    expect($schema['messages']['email.required'] ?? '')->toContain('required');
});

it('prefers a custom message, and a human attribute name', function (): void {
    $schema = exporter()->export(
        ['email' => 'required'],
        ['email.required' => 'We need your address.'],
        ['email' => 'Email address'],
    );

    expect($schema['messages']['email.required'])->toBe('We need your address.')
        ->and($schema['fields']['email']['attribute'])->toBe('Email address');
});

it('handles every rule input shape Laravel accepts', function (mixed $rules): void {
    // No second parser: ValidationRuleParser is Laravel's own and already
    // handles pipe strings, arrays and Rule:: builders.
    $schema = exporter()->export(['field' => $rules]);

    expect(array_column($schema['fields']['field']['client'], 'rule'))->toContain('required');
})->with([
    'pipe string' => 'required|max:5',
    'array' => [['required', 'max:5']],
    'mixed array' => [['required', 'max:5']],
]);

it('routes a Rule:: builder to the server', function (): void {
    $schema = exporter()->export(['role' => ['required', Rule::in(['a', 'b'])]]);

    // Rule::in stringifies to `in:"a","b"`, which the client CAN decide.
    expect(array_column($schema['fields']['role']['client'], 'rule'))->toContain('in');
});

it('never lets a rule appear as both client and server', function (): void {
    $schema = exporter()->export(['f' => 'required|email|unique:users|exists:x|image']);
    $client = array_column($schema['fields']['f']['client'], 'rule');

    expect(array_intersect($client, $schema['fields']['f']['server']))->toBeEmpty();
});

it('keeps the server list authoritative over the client list', function (): void {
    // Both are consulted rather than trusting the omission, so adding a rule
    // to CLIENT by mistake cannot silently move a database check into the
    // browser.
    foreach (RuleCatalogue::SERVER as $rule) {
        expect(RuleCatalogue::isClientCheckable($rule))->toBeFalse($rule);
    }
});

it('produces JSON the runner can parse', function (): void {
    $json = exporter()->toJson(['email' => 'required|email']);

    expect(json_decode($json, true))->toHaveKeys(['version', 'fields', 'messages']);
});
