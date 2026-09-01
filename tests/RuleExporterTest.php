<?php

declare(strict_types=1);

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Simtabi\Laranail\Validation\Contracts\ClientCheckable;
use Simtabi\Laranail\Validation\Rules\Banking\Iban;
use Simtabi\Laranail\Validation\Rules\Banking\Luhn;
use Simtabi\Laranail\Validation\Rules\Crypto\BitcoinAddress;
use Simtabi\Laranail\Validation\Rules\Geo\Latitude;
use Simtabi\Laranail\Validation\Rules\Identifiers\Imei;
use Simtabi\Laranail\Validation\Rules\Text\Slug;
use Simtabi\Laranail\ValidationJs\RuleCatalogue;
use Simtabi\Laranail\ValidationJs\RuleExporter;

// laranail/validation is a DEV dependency and is PHP ^8.5, so the 8.4 CI cell
// installs without it. These cases exercise the exporter against that package's
// own rule classes and cannot run when it is absent; the package's own src/
// guards the same boundary with interface_exists().
beforeEach(function (): void {
    if (! interface_exists(ClientCheckable::class)) {
        $this->markTestSkipped('laranail/validation not installed');
    }
});

function exporter(): RuleExporter
{
    return new RuleExporter(app('translator'));
}

it('splits rules into what the browser can decide and what it cannot', function (): void {
    $schema = exporter()->export(['email' => 'required|email|unique:users']);

    expect(array_column($schema['fields']['email']['client'], 'rule'))->toBe(['required', 'email'])
        ->and($schema['fields']['email']['server'])->toBe(['unique']);
});

it('GUARANTEES server-rule parameters never reach the wire', function (): void {
    // The stripping is a documented security property, not an implementation
    // detail (docs/schema.md, "What the schema deliberately does not say").
    // A schema ships to every browser: table names, column names, and the
    // shape of a database check are reconnaissance a page should not hand
    // out. This locks the WHOLE serialized schema — not one field's list —
    // so a future exporter path that leaks parameters fails here.
    $json = exporter()->toJson([
        'email' => 'required|email|unique:app_users,email_column|exists:tenants,id',
        'code' => ['required', 'my_custom_check:secret_arg'],
    ]);

    expect($json)->not->toContain('app_users')
        ->and($json)->not->toContain('email_column')
        ->and($json)->not->toContain('tenants')
        ->and($json)->not->toContain('secret_arg');
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

it('leaves :attribute unfilled, because only the runner knows the concrete field', function (): void {
    // Filling it here is wrong for exactly one shape, and silently: the schema
    // key is the PATTERN, the failure is reported on the expanded path, and a
    // baked-in pattern showed the user "The items.*.qty field is required."
    $message = exporter()->export(['items.*.qty' => 'required'])['messages']['items.*.qty.required'];

    expect($message)->toContain(':attribute')
        ->and($message)->not->toContain('items.*.qty');
});

it('exports every variant of a size message, in a key of their own', function (): void {
    // Which variant applies depends on the rule set, on the value, and — for
    // gt/gte/lt/lte — on whether the value is numeric. None of that is known
    // here, so all four travel.
    //
    // In `messageVariants`, NOT by changing the type of `messages`. An older
    // runner calls replaceAll() on whatever `messages` holds, so handing it an
    // object throws — and a new key it has never heard of is simply ignored.
    $schema = exporter()->export(['n' => 'numeric|max:5']);

    expect($schema['messageVariants']['n.max'])
        ->toHaveKeys(['numeric', 'file', 'string', 'array'])
        ->and($schema['messageVariants']['n.max']['numeric'])->not->toContain('characters')
        // And `messages` still holds a plain string, which is the shape every
        // runner ever released expects.
        ->and($schema['messages']['n.max'])->toBeString()
        ->toContain('characters');
});

it('emits the parameter name an older runner reads, alongside the current one', function (): void {
    // The size bounds were named `value` in the first release and are now named
    // for the placeholder their message uses. The pre-1.0 'value' alias is
    // gone with the clean schema v1 — a runner old enough to want it cannot
    // import the package it shipped in.
    $params = exporter()->export(['n' => 'max:255'])['fields']['n']['client'][0]['params'];

    expect($params)->toBe(['max' => '255']);
});

it('adds no alias for a parameter that never had another name', function (): void {
    // The aliases are a migration aid, not a habit. A rule whose names have
    // never changed carries exactly what it needs.
    $params = exporter()->export(['n' => 'between:1,5'])['fields']['n']['client'][0]['params'];

    expect($params)->toBe(['min' => '1', 'max' => '5']);
});

it('keeps a custom message a plain string, variants or not', function (): void {
    $schema = exporter()->export(['n' => 'max:5'], ['n.max' => 'Too long.']);

    expect($schema['messages']['n.max'])->toBe('Too long.');
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

it('checks the conditional presence family in the browser', function (string $rule): void {
    // These decide requiredness from other fields in the same submission,
    // all of which the browser already has. Sending them to the server spends
    // a round trip on the commonest dynamic-form case.
    $schema = exporter()->export(['field' => $rule]);

    expect($schema['fields']['field']['server'])->toBeEmpty()
        ->and($schema['fields']['field']['client'])->not->toBeEmpty();
})->with([
    'required_if:kind,card',
    'required_unless:kind,cash',
    'required_with:a',
    'required_with_all:a,b',
    'required_without:a',
    'required_without_all:a,b',
    'required_if_accepted:agree',
]);

it('keeps exclude_* on the server, because it changes the SHAPE of the result', function (string $rule): void {
    // Every other rule answers pass or fail. `exclude_if` removes the field
    // from validated() entirely, so a client that "handled" it would have to
    // return a different data set, not a different verdict — a larger change
    // than a rule implementation, and wrong to fake.
    $schema = exporter()->export(['field' => $rule]);

    expect($schema['fields']['field']['server'])->not->toBeEmpty()
        ->and(array_column($schema['fields']['field']['client'], 'rule'))->not->toContain(explode(':', $rule)[0]);
})->with([
    'exclude',
    'exclude_if:other,x',
    'exclude_unless:other,x',
    'exclude_with:other',
    'exclude_without:other',
]);

it('names only the dependent field, leaving variadic values positional', function (): void {
    // `required_if:kind,card,cheque` takes a field and then SEVERAL values.
    // Naming the second would imply there is exactly one.
    $params = exporter()->export(['f' => 'required_if:kind,card,cheque'])['fields']['f']['client'][0]['params'];

    expect($params['other'])->toBe('kind')
        ->and(array_values(array_diff_key($params, ['other' => null])))->toBe(['card', 'cheque']);
});

it('exports every rule a multi-rule advertisement carries', function (): void {
    // Latitude is `is_numeric` plus a range, so its browser form is two native
    // rules. Exporting only the first would check that 'abc' is not a latitude
    // while letting 1000 through.
    $schema = exporter()->export(['lat' => [new Latitude]]);

    expect($schema['fields']['lat']['server'])->toBeEmpty()
        ->and(array_column($schema['fields']['lat']['client'], 'rule'))->toBe(['numeric', 'between'])
        // Named by the catalogue on the way out, like any other between:
        // an advertised rule goes through the same parameter naming as a
        // string rule, so the runner reads one set of keys.
        ->and($schema['fields']['lat']['client'][1]['params'])->toBe(['min' => '-90', 'max' => '90']);
});

it('keeps advertised parameter NAMES, whatever order the rule wrote them in', function (): void {
    // ClientCheckable documents named keys, and names are the contract:
    // re-keying them positionally silently binds each VALUE to whatever
    // name sits at that position in the catalogue table. A rule that wrote
    // ['max' => …, 'min' => …] exported inverted bounds — the browser then
    // rejected every in-range value.
    $rule = new class implements ClientCheckable, ValidationRule
    {
        public function validate(string $attribute, mixed $value, Closure $fail): void {}

        public function clientRules(): array
        {
            return [['rule' => 'between', 'params' => ['max' => '90', 'min' => '-90']]];
        }
    };

    $schema = exporter()->export(['f' => [$rule]]);

    expect($schema['fields']['f']['client'][0]['params']['min'])->toBe('-90')
        ->and($schema['fields']['f']['client'][0]['params']['max'])->toBe('90');
});

it('rejects a partial advertisement whole, rather than exporting a subset', function (): void {
    // If any advertised rule is unusable, the WHOLE advertisement is dropped.
    // Exporting the usable half would check a field against a subset of its
    // own rules and pass values the full set rejects — a green tick that is
    // worse than a round trip.
    $rule = new class implements ClientCheckable, ValidationRule
    {
        public function validate(string $attribute, mixed $value, Closure $fail): void {}

        public function clientRules(): array
        {
            return [
                ['rule' => 'numeric', 'params' => []],
                ['rule' => 'not_a_real_rule', 'params' => []],
            ];
        }
    };

    $schema = exporter()->export(['f' => [$rule]]);

    expect($schema['fields']['f']['client'])->toBeEmpty()
        ->and($schema['fields']['f']['server'])->not->toBeEmpty();
});

it('honours a rule that advertises a browser form', function (): void {
    // laranail/validation's Slug returns its OWN pattern, so what runs in the
    // browser is the same expression the PHP rule uses.
    $schema = exporter()->export(['slug' => [new Slug]]);

    expect($schema['fields']['slug']['server'])->toBeEmpty()
        ->and($schema['fields']['slug']['client'][0]['rule'])->toBe('regex');
});

it('unwraps the invokable wrapper Laravel puts around a rule object', function (): void {
    // explode() wraps a ValidationRule in InvokableValidationRule, so without
    // unwrapping, the exporter sees the wrapper: ClientCheckable is
    // unreachable and the server name is the wrapper's mangled FQN rather
    // than the rule's.
    $schema = exporter()->export(['f' => [new Iban]]);

    expect($schema['fields']['f']['server'])->toBe(['iban']);
});

it('still routes a checksum rule to the server', function (string $class): void {
    // These must never advertise a browser form: a shape-only pattern would
    // pass a mistyped account number in the browser and fail it on the server.
    $schema = exporter()->export(['f' => [new $class]]);

    expect($schema['fields']['f']['client'])->toBeEmpty()
        ->and($schema['fields']['f']['server'])->not->toBeEmpty();
})->with([
    Iban::class,
    Luhn::class,
    Imei::class,
    BitcoinAddress::class,
]);

it('ignores an advertised rule the runner does not implement', function (): void {
    // A rule inventing its own client rule name would be exported and then
    // silently do nothing — the failure the server default exists to prevent.
    $rule = new class implements ClientCheckable, ValidationRule
    {
        public function validate(string $attribute, mixed $value, Closure $fail): void {}

        public function clientRules(): array
        {
            return [['rule' => 'not_a_real_rule', 'params' => []]];
        }
    };

    $schema = exporter()->export(['f' => [$rule]]);

    expect($schema['fields']['f']['client'])->toBeEmpty()
        ->and($schema['fields']['f']['server'])->not->toBeEmpty();
});

it('encodes JSON safely for the inline <script> context the API invites', function (): void {
    // toJson() exists to be dropped into a Blade view inside a <script>
    // block. Without JSON_HEX_TAG a translated message (or attribute name)
    // containing "</script>" terminates that block early and everything
    // after it parses as markup — stored XSS via a translation string. The
    // HEX_APOS/QUOT/AMP flags harden the attribute-context variants.
    $json = exporter()->toJson(
        ['f' => 'required'],
        ['f.required' => "</script><script>alert(1)</script> & 'quoted' \"twice\""],
    );

    expect($json)->not->toContain('</script>')
        ->and($json)->not->toContain("'")
        ->and($json)->not->toContain('&');

    // And the round trip is untouched — escaping is transport-only.
    $decoded = json_decode($json, true, flags: JSON_THROW_ON_ERROR);

    expect($decoded['messages']['f.required'])
        ->toBe("</script><script>alert(1)</script> & 'quoted' \"twice\"");
});

it('stamps the schema MAJOR version, which is meant to stay put', function (): void {
    // Gating on this is the last resort, not the mechanism. Within a major
    // version every change is additive and a runner ignores what it does not
    // recognise, which is what lets the two halves ship apart. Bumping it costs
    // every consumer a lockstep upgrade — so this assertion is here to make
    // that a deliberate act rather than a side effect.
    expect(exporter()->export(['f' => 'required'])['version'])->toBe(RuleExporter::VERSION)
        ->and(RuleExporter::VERSION)->toBe(1);
});

/*
 * Wire compatibility with a runner that is already published.
 *
 * These assert the SHAPE the first release reads, not any behaviour of this
 * package. They are what lets the two halves ship apart, and each one records a
 * specific way that could be broken without noticing — verified once against the
 * v0.1.0 runner itself, and pinned here so it stays true.
 */
it('keeps every exported message a plain string', function (): void {
    // A published runner calls replaceAll() on whatever `messages` holds.
    // Handing it an object throws, in the browser, on a form that worked
    // yesterday. Variants go in `messageVariants`, which it ignores.
    $schema = exporter()->export([
        'a' => 'required|max:5',
        'b' => 'numeric|between:1,9',
        'c' => 'gt:other',
        'd' => 'in:x,y',
    ]);

    foreach ($schema['messages'] as $key => $message) {
        expect($message)->toBeString("{$key} is not a string, which an older runner cannot render");
    }
});

it('carries no legacy parameter alias in the clean schema v1', function (string $rule, string $legacy): void {
    // The 'value' spelling was a migration aid for a runner that could never
    // actually be installed (J1 predates every real consumer). Pre-1.0 is
    // the moment to retire it; a stale key that nothing reads is schema
    // noise that every future runner would have to keep tolerating.
    $params = exporter()->export(['f' => $rule])['fields']['f']['client'][0]['params'];

    expect($params)->not->toHaveKey($legacy);
})->with([
    'max:5' => ['max:5', 'value'],
    'min:5' => ['min:5', 'value'],
    'size:5' => ['size:5', 'value'],
]);

it('adds only keys, never removes one the first release read', function (): void {
    // The additive rule, asserted at the top level. A key disappearing is the
    // one change that cannot be absorbed by a runner ignoring what it does not
    // know, so it has to be a deliberate major bump rather than a refactor.
    expect(exporter()->export(['f' => 'required']))
        ->toHaveKeys(['version', 'fields', 'messages'])
        ->and(exporter()->export(['f' => 'required'])['fields']['f'])
        ->toHaveKeys(['attribute', 'client', 'server']);
});

it('exports an excepted field server-only — the per-field client opt-out', function (): void {
    $schema = app(RuleExporter::class)->export(
        ['email' => 'required|email|max:64', 'name' => 'required|string'],
        except: ['email'],
    );

    // The rule NAMES still travel, so the runner reports the field
    // undetermined instead of green — nothing evaluates client-side.
    expect($schema['fields']['email']['client'])->toBe([])
        ->and($schema['fields']['email']['server'])->toBe(['required', 'email', 'max'])
        ->and($schema['fields']['name']['client'])->not->toBe([]);
});
