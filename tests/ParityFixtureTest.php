<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Validator;
use Simtabi\Laranail\Validation\Rules\Crypto\EthereumAddress;
use Simtabi\Laranail\Validation\Rules\Identifiers\SemVer;
use Simtabi\Laranail\Validation\Rules\Net\Subdomain;
use Simtabi\Laranail\Validation\Rules\Text\Slug;
use Simtabi\Laranail\ValidationJs\RuleExporter;

/**
 * Generates the fixture the JavaScript parity test consumes.
 *
 * This is the only honest way to claim the runner "matches Laravel": run the
 * real validator over a grid of rules and values, record its verdicts, and
 * make the JavaScript reproduce them. Asserting the runner against my own
 * expectations would only prove it matches what I believed Laravel does —
 * which, across this project, has repeatedly not been the same thing.
 *
 * The fixture is committed so the JS suite runs without PHP.
 */
it('writes the parity fixture from Laravel’s own verdicts', function (): void {
    $grid = [
        'required' => ['ok', '', '   ', null, [], ['a']],
        'email' => ['a@b.co', 'no-at', 'a@b', '', 'a b@c.co'],
        'numeric' => ['12', '1.5', '-3', 'abc', '1e3', ''],
        'integer' => ['12', '1.5', '-3', 'abc'],
        'string' => ['abc', 12, true, ''],
        'boolean' => [true, false, 1, 0, '1', '0', 'yes', 2],
        'alpha' => ['abc', 'abc1', 'ábc', 'a b'],
        'alpha_num' => ['abc1', 'abc-1', 'ábc1'],
        'alpha_dash' => ['a-b_c1', 'a b', 'a.b'],
        'url' => ['https://a.co', 'http://a.co', 'ftp://a.co', 'a.co', 'javascript:alert(1)', 'file:///etc/passwd'],
        'uuid' => ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'nope', '3f2504e0-4f89-41d3-9a0c-0305e82c330'],
        'ulid' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'nope'],
        'ip' => ['127.0.0.1', '::1', '999.1.1.1', 'nope'],
        'ipv4' => ['127.0.0.1', '::1', '256.1.1.1'],
        'mac_address' => ['00:1B:44:11:3A:B7', '00-1B-44-11-3A-B7', 'nope'],
        'hex_color' => ['#fff', '#ffffff', '#ffff', '#fffff', 'fff'],
        'json' => ['{"a":1}', '[1,2]', 'not json', '"str"'],
        'lowercase' => ['abc', 'Abc'],
        'uppercase' => ['ABC', 'Abc'],
        'ascii' => ['abc', 'ábc'],
        'max:5' => ['abcde', 'abcdef', '5', '6', [1, 2, 3]],
        'min:3' => ['abc', 'ab', '3', '2'],
        'size:4' => ['abcd', 'abc', '4', '5'],
        'between:2,4' => ['abc', 'a', 'abcde', '3', '9'],
        'digits:4' => ['1234', '123', 'abcd'],
        'digits_between:2,4' => ['123', '1', '12345'],
        'numeric|max:5' => ['5', '6', '4.9'],
        'numeric|min:3' => ['3', '2.9'],
        'in:a,b,c' => ['a', 'd', ''],
        'not_in:a,b' => ['c', 'a'],
        'starts_with:ab,cd' => ['abc', 'cde', 'xyz'],
        'ends_with:ing' => ['testing', 'tested'],
        'contains:foo' => ['a foo b', 'a bar b'],
        'accepted' => ['yes', 'on', '1', 1, true, 'no', ''],
        'declined' => ['no', 'off', '0', 0, false, 'yes'],
        'regex:/^[a-z]+$/' => ['abc', 'ABC', 'a1'],
        'not_regex:/\d/' => ['abc', 'a1'],
        'multiple_of:3' => ['9', '10', '0.3'],
        'decimal:2' => ['1.23', '1.2', '1', '1.234'],
        'gt:5' => ['6', '5', '4'],
        'lte:5' => ['5', '6'],
    ];

    $exporter = new RuleExporter(app('translator'));
    $cases = [];

    foreach ($grid as $rule => $values) {
        foreach ($values as $index => $value) {
            $laravel = Validator::make(['field' => $value], ['field' => $rule])->passes();

            $cases[] = [
                'rule' => $rule,
                'value' => $value,
                'schema' => $exporter->export(['field' => $rule]),
                'laravel' => $laravel,
                'id' => "{$rule} #{$index}",
            ];
        }
    }

    // Cross-field rules need a second field present.
    foreach ([
        ['same:other', 'x', 'x'], ['same:other', 'x', 'y'],
        ['different:other', 'x', 'y'], ['different:other', 'x', 'x'],
        ['confirmed', 'x', 'x'], ['confirmed', 'x', 'y'],
    ] as [$rule, $value, $other]) {
        $key = $rule === 'confirmed' ? 'field_confirmation' : 'other';
        $data = ['field' => $value, $key => $other];

        $cases[] = [
            'rule' => $rule,
            'value' => $value,
            'data' => $data,
            'schema' => $exporter->export(['field' => $rule]),
            'laravel' => Validator::make($data, ['field' => $rule])->passes(),
            'id' => "{$rule} ({$value} vs {$other})",
        ];
    }

    // Rules from laranail/validation that advertise a browser form. Each
    // returns its OWN pattern, so what runs in the browser is the same
    // expression the PHP rule uses — there is no second implementation.
    foreach ([
        [new Slug, ['my-post', 'My-Post', 'my--post', 'my post']],
        [new SemVer, ['1.0.0', '1.0.0-alpha.1', '1.0', 'v1.0.0']],
        [new Subdomain, ['blog', 'my-blog', '-blog', 'a_b']],
        [new EthereumAddress, ['0x'.str_repeat('a', 40), '0x'.str_repeat('g', 40)]],
    ] as [$rule, $values]) {
        foreach ($values as $index => $value) {
            $cases[] = [
                'rule' => class_basename($rule),
                'value' => $value,
                'schema' => $exporter->export(['field' => [$rule]]),
                'laravel' => Validator::make(['field' => $value], ['field' => [$rule]])->passes(),
                'id' => class_basename($rule)." #{$index}",
            ];
        }
    }

    // Conditionals. The commonest dynamic-form case, and the one that most
    // wastes a round trip when it falls to the server.
    foreach ([
        ['required_if:kind,card', ['kind' => 'card']],
        ['required_if:kind,card', ['kind' => 'cash']],
        ['required_if:kind,card', ['kind' => 'card', 'field' => 'x']],
        ['required_if:kind,card,cheque', ['kind' => 'cheque']],
        ['required_if:kind,card,cheque', ['kind' => 'cash']],
        ['required_unless:kind,cash', ['kind' => 'card']],
        ['required_unless:kind,cash', ['kind' => 'cash']],
        ['required_unless:kind,cash', ['kind' => 'card', 'field' => 'x']],
        ['required_with:a', ['a' => '1']],
        ['required_with:a', []],
        ['required_with:a,b', ['b' => '1']],
        ['required_with_all:a,b', ['a' => '1']],
        ['required_with_all:a,b', ['a' => '1', 'b' => '1']],
        ['required_without:a', []],
        ['required_without:a', ['a' => '1']],
        ['required_without_all:a,b', []],
        ['required_without_all:a,b', ['a' => '1']],
        ['required_if_accepted:agree', ['agree' => 'yes']],
        ['required_if_accepted:agree', ['agree' => 'no']],
    ] as $index => [$rule, $data]) {
        $cases[] = [
            'rule' => $rule,
            'value' => $data['field'] ?? null,
            'data' => $data,
            'schema' => $exporter->export(['field' => $rule]),
            'laravel' => Validator::make($data, ['field' => $rule])->passes(),
            'id' => "conditional #{$index} {$rule}",
        ];
    }

    // Wildcards. Laravel expands `items.*.email` against the submitted data
    // and validates each concrete path; a runner that treats the pattern as a
    // literal field name reports a failure on a field nobody submitted.
    foreach ([
        ['items.*.email', 'required|email', ['items' => [['email' => 'a@b.co'], ['email' => 'c@d.co']]]],
        ['items.*.email', 'required|email', ['items' => [['email' => 'a@b.co'], ['email' => 'nope']]]],
        ['items.*.email', 'required|email', ['items' => []]],
        ['items.*.email', 'required|email', []],
        ['items.*.qty', 'required|numeric|min:2', ['items' => [['qty' => '3']]]],
        ['items.*.qty', 'required|numeric|min:2', ['items' => [['qty' => '1']]]],
        ['rows.*.cols.*.v', 'required', ['rows' => [['cols' => [['v' => 'x'], ['v' => '']]]]]],
    ] as $index => [$field, $rule, $data]) {
        $cases[] = [
            'rule' => "{$field} => {$rule}",
            'value' => null,
            'data' => $data,
            'schema' => $exporter->export([$field => $rule]),
            'laravel' => Validator::make($data, [$field => $rule])->passes(),
            'id' => "wildcard #{$index} {$field}",
        ];
    }

    $path = dirname(__DIR__).'/js/tests/fixtures/parity.json';
    file_put_contents($path, json_encode($cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

    expect($cases)->not->toBeEmpty()
        ->and(file_exists($path))->toBeTrue();
});
