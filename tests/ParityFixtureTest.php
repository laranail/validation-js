<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Validator;
use Simtabi\Laranail\Validation\Rules\Colour\CssColor;
use Simtabi\Laranail\Validation\Rules\Crypto\EthereumAddress;
use Simtabi\Laranail\Validation\Rules\Geo\Latitude;
use Simtabi\Laranail\Validation\Rules\Geo\Longitude;
use Simtabi\Laranail\Validation\Rules\Identifiers\SemVer;
use Simtabi\Laranail\Validation\Rules\Net\Subdomain;
use Simtabi\Laranail\Validation\Rules\Numbers\MonetaryAmount;
use Simtabi\Laranail\Validation\Rules\Postal\PostalCode;
use Simtabi\Laranail\Validation\Rules\Text\CaseStyle;
use Simtabi\Laranail\Validation\Rules\Text\Slug;
use Simtabi\Laranail\Validation\Rules\Text\Username;
use Simtabi\Laranail\Validation\Rules\Vendor\VendorIdentifier;
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
        // The literal forms JavaScript's Number() accepts and PHP's
        // is_numeric() does not — hex, binary, octal, and the word Infinity.
        'numeric' => ['12', '1.5', '-3', 'abc', '1e3', '', '0x1A', '0b11', '0o17', 'Infinity', '-Infinity', '.5', '5.', '+5', '1_000', '12.34.56'],
        // '10.0' and '1e2' are the J5 rows: numeric-and-whole to JavaScript's
        // Number(), rejected by FILTER_VALIDATE_INT. '010' (leading zero),
        // ' 10' (whitespace) and the overflow row probe the filter's edges.
        'integer' => ['12', '1.5', '-3', 'abc', '0x1A', '0b11', 'Infinity', '10.0', '1e2', '010', '+10', ' 10', '99999999999999999999', 12, 12.0],
        'integer:strict' => [12, '12', 1.5],
        'boolean:strict' => [true, false, 1, '1'],
        'string' => ['abc', 12, true, ''],
        'boolean' => [true, false, 1, 0, '1', '0', 'yes', 2],
        'alpha' => ['abc', 'abc1', 'ábc', 'a b'],
        'alpha_num' => ['abc1', 'abc-1', 'ábc1'],
        'alpha_dash' => ['a-b_c1', 'a b', 'a.b'],
        'url' => ['https://a.co', 'http://a.co', 'ftp://a.co', 'a.co', 'javascript:alert(1)', 'file:///etc/passwd', 'ws://a.co', 'redis://a.co', 'foo://a.co'],
        // J6: protocol parameters are an exact allow-list, not a suggestion.
        'url:https' => ['https://a.co', 'http://a.co'],
        'url:http,https' => ['http://a.co', 'ftp://a.co'],
        'uuid' => ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'nope', '3f2504e0-4f89-41d3-9a0c-0305e82c330'],
        'ulid' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'nope'],
        'ip' => ['127.0.0.1', '::1', '999.1.1.1', 'nope'],
        // Leading zeros are the interesting ones: PHP's FILTER_FLAG_IPV4
        // refuses them and a `\d{1,3}` regex does not.
        'ipv4' => ['127.0.0.1', '::1', '256.1.1.1', '010.1.1.1', '01.2.3.4', '0.0.0.0'],
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
        // Array values are the interesting ones: with an `array` rule Laravel
        // switches to loose SUBSET semantics (array_diff); without one an
        // array value simply fails `in` (and passes `not_in`). A runner that
        // stringifies the array gets both directions wrong — String(['a'])
        // === 'a' is a green tick `in:a,b` never gave.
        'in:a,b,c' => ['a', 'd', '', ['a'], ['a', 'b']],
        'not_in:a,b' => ['c', 'a', ['a'], ['c']],
        'array|in:a,b,c' => [['a', 'b'], ['a', 'x'], [], [['nested']]],
        'array|not_in:a,b' => [['a'], ['c', 'd']],
        'starts_with:ab,cd' => ['abc', 'cde', 'xyz'],
        'ends_with:ing' => ['testing', 'tested'],
        'contains:foo' => ['a foo b', 'a bar b'],
        // J12: the doesnt_* family and the non-array question for
        // doesnt_contain, previously untested in this grid.
        'doesnt_contain:foo' => [['foo'], ['bar'], 'a foo b', 'plain', 12],
        'doesnt_start_with:ab,cd' => ['abc', 'cde', 'xyz'],
        'doesnt_end_with:ing' => ['testing', 'rested'],
        'accepted' => ['yes', 'on', '1', 1, true, 'no', ''],
        'declined' => ['no', 'off', '0', 0, false, 'yes'],
        'regex:/^[a-z]+$/' => ['abc', 'ABC', 'a1'],
        'not_regex:/\d/' => ['abc', 'a1'],
        'multiple_of:3' => ['9', '10', '0.3'],
        'decimal:2' => ['1.23', '1.2', '1', '1.234'],
        // J11: '1.' — a dot with no digits after it — is in Laravel's grammar.
        'decimal:0,2' => ['1.', '1', '.5', '1.23', '1.234'],
        'gt:5' => ['6', '5', '4'],
        'lt:5' => ['4', '5'],
        'lte:5' => ['5', '6'],
        'ipv6' => ['::1', '2001:db8::1', '127.0.0.1', 'nope'],
        // The date family — the biggest client-rule gap. Shapes the runner
        // decides must match Laravel; anything outside its documented shape
        // set degrades to undetermined and is excluded from this comparison.
        'date' => ['2023-06-15', '2023-02-31', '2023-13-01', '2023-06-15 10:30', '2023-06-15T10:30:00Z', '6/15/2023', '15-06-2023', '2023/06/15', '20230615', 'not a date', '2023-6-5', '0000-01-01'],
        'date_format:Y-m-d' => ['2023-06-15', '2023-6-5', '15/06/2023', '2023-02-31', 'nope'],
        'date_format:d/m/Y' => ['15/06/2023', '2023-06-15', '31/02/2023'],
        'date_format:Y-m-d H:i' => ['2023-06-15 10:30', '2023-06-15 25:30', '2023-06-15'],
        'date_format:H:i' => ['10:30', '25:30', '10:75'],
        'date_format:Y-m-d,Y/m/d' => ['2023-06-15', '2023/06/15', '15.06.2023'],
        'after:2023-06-15' => ['2023-06-16', '2023-06-15', '2023-06-14', 'not a date'],
        'after_or_equal:2023-06-15' => ['2023-06-15', '2023-06-14'],
        'before:2023-06-15' => ['2023-06-14', '2023-06-15', '2023-06-16'],
        'before_or_equal:2023-06-15' => ['2023-06-15', '2023-06-16'],
        // P3's lesson from the PHP side, mirrored: date_equals compares the
        // full timestamp, not the calendar day.
        'date_equals:2023-06-15' => ['2023-06-15', '2023-06-15 08:00:00', '2023-06-16'],
        'date|after:2023-06-15 10:00:00' => ['2023-06-15 10:00:01', '2023-06-15 09:59:59'],
        'timezone' => ['Europe/Berlin', 'Africa/Nairobi', 'UTC', 'Mars/Olympus', 'europe/berlin', 'EST'],
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
        // J9: Laravel's same/different are STRICT — an integer 1 is not '1'.
        ['same:other', 1, '1'], ['same:other', 1, 1], ['same:other', '1', 1],
        ['different:other', 1, '1'], ['different:other', 1, 1],
        ['same:other', ['a'], ['a']], ['same:other', ['a'], ['b']],
        ['different:other', 'x', 'y'], ['different:other', 'x', 'x'],
        ['confirmed', 'x', 'x'], ['confirmed', 'x', 'y'],
        // J10: comparisons decide numeric-ness ONCE per attribute; these are
        // the shapes where per-side promotion diverges.
        // Date comparisons against a FIELD reference.
        ['after:other', '2023-06-16', '2023-06-15'], ['after:other', '2023-06-14', '2023-06-15'],
        ['before_or_equal:other', '2023-06-15', '2023-06-15'], ['before_or_equal:other', '2023-06-16', '2023-06-15'],
        ['gt:other', '10', '9'], ['gt:other', '9', '10'],
        ['gt:other', 'abcd', 'abc'], ['gt:other', 'abc', 'abcd'],
        ['gt:other', '10', 'abc'], ['gt:other', 'abc', '10'],
        ['lte:other', '9', '10'], ['lte:other', '10', '9'],
        ['gte:other', ['a', 'b'], ['a']],
    ] as [$rule, $value, $other]) {
        $key = $rule === 'confirmed' ? 'field_confirmation' : 'other';
        $data = ['field' => $value, $key => $other];

        $cases[] = [
            'rule' => $rule,
            'value' => $value,
            'data' => $data,
            'schema' => $exporter->export(['field' => $rule]),
            'laravel' => Validator::make($data, ['field' => $rule])->passes(),
            'id' => sprintf('%s (%s vs %s)', $rule, json_encode($value), json_encode($other)),
        ];
    }

    // Presence and nullability — the axis the grid above cannot reach, because
    // it always sets the key.
    //
    // The three states are not interchangeable, and this is where a runner
    // built on "is the value empty" goes wrong. An ABSENT attribute runs only
    // the implicit rules. A PRESENT NULL one runs EVERYTHING, so `integer` on
    // null fails. `nullable` is what opts the second back out, and it is the
    // rule set that decides that — not the value.
    //
    // Four of these passed in the browser and failed on the server before the
    // gate was rewritten, which is the exact lie this package exists to avoid.
    foreach ([
        ['integer', ['field' => null]],
        ['integer', []],
        ['integer', ['field' => []]],
        ['nullable|integer', ['field' => null]],
        ['nullable|integer', ['field' => 'abc']],
        ['string', ['field' => null]],
        ['string', ['field' => []]],
        ['string', []],
        ['numeric', ['field' => null]],
        ['email', ['field' => null]],
        ['max:5', ['field' => null]],
        ['array', ['field' => null]],
        ['nullable|string|max:255', ['field' => null]],
        ['nullable|string|max:255', ['field' => '']],
        ['required|string', ['field' => null]],
        ['required|string', ['field' => []]],
        ['sometimes|integer', []],
        ['sometimes|integer', ['field' => 'abc']],
        ['present', ['field' => null]],
        ['present', []],
        ['present|nullable|string', ['field' => null]],
        ['filled', ['field' => null]],
        ['filled', []],
        // Comparison rules are NOT implicit in Laravel, so an absent field
        // skips them entirely — including when the counterpart is present.
        ['same:other', ['other' => 'x']],
        ['same:other', ['field' => 'x', 'other' => 'x']],
        ['different:other', ['other' => 'x']],
        ['confirmed', ['field_confirmation' => 'x']],
        ['nullable|required_without_all:a,b', []],
        ['nullable|required_without_all:a,b', ['a' => 'x']],
        ['nullable|string|required_without_all:a,b', ['field' => null, 'a' => 'x']],
    ] as $index => [$rule, $data]) {
        $cases[] = [
            'rule' => $rule,
            'value' => $data['field'] ?? null,
            'data' => $data,
            'schema' => $exporter->export(['field' => $rule]),
            'laravel' => Validator::make($data, ['field' => $rule])->passes(),
            'id' => "presence #{$index} {$rule} ".json_encode($data),
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

    // The rules that gained a browser form. Each sends its OWN pattern, so
    // what runs here is the expression the PHP rule matches against.
    foreach ([
        [new CaseStyle('kebab'), ['my-post', 'myPost', 'my_post']],
        [new Username(3, 12), ['alice', 'al', 'a_b', 'a__b', 'aliceandbobandcarol']],
        [new MonetaryAmount, ['12.34', '12.345', '-12.00', '1e3', '1,234.50']],
        [new MonetaryAmount(2, true), ['-12.00', '12.00']],
        [new VendorIdentifier('aws_region'), ['us-east-1', 'US-EAST-1', 'us-east']],
        [new VendorIdentifier('google_analytics'), ['G-ABCDE12345', 'g-abcde12345', 'UA-1-1']],
        [new VendorIdentifier('microsoft_tenant'), ['common', '72f988bf-86f1-41af-91ab-2d7cd011db47', 'nope']],
        [new PostalCode(['US']), ['90210', '9021', 'SW1A 1AA']],
        [new PostalCode(['US', 'CA']), ['90210', 'K1A 0B1', 'k1a 0b1', 'nonsense']],
    ] as [$rule, $values]) {
        foreach ($values as $index => $value) {
            $cases[] = [
                'rule' => class_basename($rule),
                'value' => $value,
                'schema' => $exporter->export(['field' => [$rule]]),
                'laravel' => Validator::make(['field' => $value], ['field' => [$rule]])->passes(),
                'id' => class_basename($rule)." advertised #{$index} ".$value,
            ];
        }
    }

    // The rules whose browser form is more than one rule, or a pattern that
    // had been dismissed as too large.
    foreach ([
        [new Latitude, ['0', '90', '-90', '90.1', '-90.1', '45.5', '1e1', 'abc', '0x1A', 'Infinity']],
        [new Longitude, ['180', '-180', '180.1', '0', 'abc']],
        [new CssColor, ['#fff', '#fffff', 'red', 'rebeccapurple', 'transparent', 'rgb(1,2,3)', 'rgb(300,0,0)', 'hsl(120, 50%, 50%)', 'notacolour']],
        [new CssColor(['hex']), ['#fff', 'red']],
    ] as [$rule, $values]) {
        foreach ($values as $index => $value) {
            $cases[] = [
                'rule' => class_basename($rule),
                'value' => $value,
                'schema' => $exporter->export(['field' => [$rule]]),
                'laravel' => Validator::make(['field' => $value], ['field' => [$rule]])->passes(),
                'id' => class_basename($rule)." multi #{$index} ".$value,
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
        ['required_if_declined:agree', ['agree' => 'no']],
        ['required_if_declined:agree', ['agree' => 'yes']],
        ['prohibited_if_accepted:agree', ['agree' => 'yes', 'field' => 'x']],
        ['prohibited_if_accepted:agree', ['agree' => 'no', 'field' => 'x']],
        ['prohibited_if_declined:agree', ['agree' => 'no', 'field' => 'x']],
        ['prohibited_if_declined:agree', ['agree' => 'yes', 'field' => 'x']],
        // J8: Laravel converts a literal 'null' parameter to a real null
        // (convertValuesToNull), so `required_if:other,null` fires on a
        // present-null dependent.
        ['required_if:other,null', ['other' => null]],
        ['required_if:other,null', ['other' => null, 'field' => 'x']],
        ['required_if:other,null', ['other' => 'null']],
        ['required_if:other,null', ['other' => 'x']],
        ['required_unless:other,null', ['other' => null]],
        ['required_unless:other,null', ['other' => 'x']],
        // required_if alone carries Laravel's Arr::has guard: an ABSENT
        // dependent means never required; required_unless has no guard, so
        // absent resolves to null and can match a declared 'null'.
        ['required_if:other,null', []],
        ['required_unless:other,null', []],
        // A boolean dependent converts declared true/false to REAL booleans
        // and compares strictly — '1' never matches true.
        ['required_if:other,true', ['other' => true]],
        ['required_if:other,1', ['other' => true]],
        ['required_if:other,true', ['other' => 'true']],
        // The wider conditional families, each with its trigger both ways.
        ['accepted_if:kind,card', ['kind' => 'card', 'field' => 'yes']],
        ['accepted_if:kind,card', ['kind' => 'card', 'field' => 'no']],
        ['accepted_if:kind,card', ['kind' => 'cash', 'field' => 'no']],
        ['accepted_if:kind,card', ['kind' => 'card']],
        ['declined_if:kind,card', ['kind' => 'card', 'field' => 'no']],
        ['declined_if:kind,card', ['kind' => 'card', 'field' => 'yes']],
        ['prohibited', ['field' => 'x']],
        ['prohibited', ['field' => '']],
        ['prohibited', []],
        ['prohibited_if:kind,card', ['kind' => 'card', 'field' => 'x']],
        ['prohibited_if:kind,card', ['kind' => 'card']],
        ['prohibited_if:kind,card', ['kind' => 'cash', 'field' => 'x']],
        ['prohibited_unless:kind,card', ['kind' => 'card', 'field' => 'x']],
        ['prohibited_unless:kind,card', ['kind' => 'cash', 'field' => 'x']],
        ['prohibits:a,b', ['field' => 'x', 'a' => '1']],
        ['prohibits:a,b', ['field' => 'x']],
        ['prohibits:a,b', ['a' => '1']],
        ['missing', []],
        ['missing', ['field' => null]],
        ['missing', ['field' => 'x']],
        ['missing_if:kind,card', ['kind' => 'card', 'field' => 'x']],
        ['missing_if:kind,card', ['kind' => 'cash', 'field' => 'x']],
        ['missing_unless:kind,card', ['kind' => 'cash', 'field' => 'x']],
        ['missing_unless:kind,card', ['kind' => 'card', 'field' => 'x']],
        // The missing/present *_with families trigger on the KEY existing —
        // a present-null sibling counts, which is where they differ from
        // required_with's filled-ness test.
        ['missing_with:a', ['a' => null, 'field' => 'x']],
        ['missing_with:a', ['field' => 'x']],
        ['missing_with_all:a,b', ['a' => '1', 'b' => '1', 'field' => 'x']],
        ['missing_with_all:a,b', ['a' => '1', 'field' => 'x']],
        ['present_if:kind,card', ['kind' => 'card']],
        ['present_if:kind,card', ['kind' => 'card', 'field' => null]],
        ['present_if:kind,card', ['kind' => 'cash']],
        ['present_unless:kind,card', ['kind' => 'cash']],
        ['present_unless:kind,card', ['kind' => 'card']],
        ['present_with:a', ['a' => null]],
        ['present_with:a', []],
        ['present_with_all:a,b', ['a' => '1', 'b' => '1']],
        ['present_with_all:a,b', ['a' => '1']],
        // Collections.
        ['list', ['field' => ['a', 'b']]],
        ['list', ['field' => ['x' => 'a']]],
        ['list', ['field' => 'abc']],
        ['required_array_keys:name,email', ['field' => ['name' => 'a', 'email' => 'b', 'extra' => 'c']]],
        ['required_array_keys:name,email', ['field' => ['name' => 'a']]],
        ['required_array_keys:0,1', ['field' => ['a', 'b']]],
        ['required_array_keys:name', ['field' => 'abc']],
        ['max_digits:3', ['field' => '123']],
        ['max_digits:3', ['field' => '1234']],
        ['max_digits:3', ['field' => '-12']],
        ['max_digits:3', ['field' => 123]],
        ['min_digits:2', ['field' => '12']],
        ['min_digits:2', ['field' => '1']],
        ['in_array:allowed.*', ['field' => 'b', 'allowed' => ['a', 'b']]],
        ['in_array:allowed.*', ['field' => 'c', 'allowed' => ['a', 'b']]],
        ['in_array:allowed.*', ['field' => '1', 'allowed' => [1, 2]]],
        ['in_array:allowed.*', ['field' => 'x', 'allowed' => []]],
        // Presence probes on hostile-looking paths. Laravel's Arr::has says
        // "absent" for both; a runner whose path walk uses the `in` operator
        // finds 'constructor' on Object.prototype, and one whose array-index
        // check lacks a `>= 0` guard treats -1 as within bounds — either way
        // "required_with" fires on a sibling that does not exist.
        ['required_with:meta.constructor', ['meta' => ['x' => '1']]],
        ['required_with:items.-1', ['items' => ['a', 'b']]],
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
        // Cross-field params carrying the wildcard. Laravel substitutes the
        // indices captured while expanding the ATTRIBUTE into the parameters
        // (replaceAsterisksInParameters), so row 0 compares against row 0 —
        // the canonical row-wise idiom. A runner that leaves the literal `*`
        // in the parameter can resolve nothing and fails every row.
        ['items.*.password', 'same:items.*.password_confirmation',
            ['items' => [['password' => 'a', 'password_confirmation' => 'a'], ['password' => 'b', 'password_confirmation' => 'b']]]],
        ['items.*.password', 'same:items.*.password_confirmation',
            ['items' => [['password' => 'a', 'password_confirmation' => 'a'], ['password' => 'b', 'password_confirmation' => 'c']]]],
        ['items.*.max', 'gte:items.*.min',
            ['items' => [['min' => '2', 'max' => '5'], ['min' => '4', 'max' => '3']]]],
        ['items.*.b', 'required_if:items.*.a,yes',
            ['items' => [['a' => 'yes'], ['a' => 'no']]]],
        ['items.*.b', 'required_if:items.*.a,yes',
            ['items' => [['a' => 'yes', 'b' => 'x'], ['a' => 'no']]]],
        // A DOTLESS cross-field reference inside a wildcard resolves from the
        // ROOT, not the row — Laravel's getValue() is Arr::get($data, $param)
        // with no row awareness. The row-relative meaning is spelled with the
        // wildcard path above; resolving the bare name against the row
        // green-ticks the Laravel-wrong spelling.
        ['items.*.password', 'same:password_confirmation',
            ['password_confirmation' => 'x',
                'items' => [['password' => 'x', 'password_confirmation' => 'y']]]],
        ['items.*.password', 'same:password_confirmation',
            ['password_confirmation' => 'x',
                'items' => [['password' => 'y', 'password_confirmation' => 'x']]]],
        // `distinct` ranges over the OTHER expansions of its own pattern.
        ['items.*.id', 'distinct', ['items' => [['id' => 'a'], ['id' => 'b']]]],
        ['items.*.id', 'distinct', ['items' => [['id' => 'a'], ['id' => 'a']]]],
        ['items.*.id', 'distinct', ['items' => [['id' => '1'], ['id' => '01']]]],
        ['items.*.id', 'distinct:strict', ['items' => [['id' => '1'], ['id' => 1]]]],
        ['items.*.id', 'distinct', ['items' => [['id' => '1'], ['id' => 1]]]],
        ['items.*.id', 'distinct:ignore_case', ['items' => [['id' => 'A'], ['id' => 'a']]]],
        ['items.*.id', 'distinct', ['items' => [['id' => 'A'], ['id' => 'a']]]],
        // `confirmed` inside a wildcard appends _confirmation to the CONCRETE
        // path — items.0.password_confirmation — which happens to live in the
        // row; the mechanism is the full-path suffix, not row-sibling search.
        ['items.*.password', 'confirmed',
            ['items' => [['password' => 'x', 'password_confirmation' => 'x'], ['password' => 'y', 'password_confirmation' => 'z']]]],
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

/**
 * The same idea applied to the MESSAGE rather than the verdict.
 *
 * A runner can reach the right verdict and still show the wrong sentence, and
 * that failure is invisible to the grid above — it compares booleans. It is not
 * a cosmetic difference either: an uninterpolated ":max" is what the user reads,
 * and a wildcard field whose message key never matched fell all the way through
 * to "The … field is invalid.", which names neither the rule nor the fix.
 *
 * So the expected text is Laravel's own, taken from a validator that really
 * failed, rather than anything written down here.
 */
it('writes the message-parity fixture from Laravel’s own messages', function (): void {
    $exporter = new RuleExporter(app('translator'));
    $cases = [];

    foreach ([
        // Size rules: the placeholder is `:max`/`:min`/`:size`, never `:value`.
        ['field', 'max:5', ['field' => 'abcdef'], 'field', []],
        ['field', 'numeric|max:5', ['field' => '6'], 'field', []],
        ['field', 'min:3', ['field' => 'ab'], 'field', []],
        ['field', 'size:4', ['field' => 'abc'], 'field', []],
        ['field', 'between:2,4', ['field' => 'a'], 'field', []],
        ['field', 'digits:4', ['field' => '123'], 'field', []],
        ['field', 'digits_between:2,4', ['field' => '12345'], 'field', []],
        // One placeholder over two parameters, rendered "2" or "2-4".
        ['field', 'decimal:2', ['field' => '1.234'], 'field', []],
        ['field', 'decimal:2,4', ['field' => '1.234567'], 'field', []],
        ['field', 'multiple_of:3', ['field' => '10'], 'field', []],
        ['field', 'gt:5', ['field' => '4'], 'field', []],
        ['field', 'lte:5', ['field' => '6'], 'field', []],
        // The variadic tail. Position 0 of a conditional is the DEPENDENT
        // FIELD and is already spent on `:other`; joining it into `:values`
        // rendered "required unless kind is in kind, card".
        ['field', 'required_if:kind,card', ['kind' => 'card'], 'field', []],
        ['field', 'required_if:kind,card,cheque', ['kind' => 'cheque'], 'field', []],
        ['field', 'required_unless:kind,cash', ['kind' => 'card'], 'field', []],
        ['field', 'required_with:a', ['a' => 'x'], 'field', []],
        ['field', 'starts_with:ab,cd', ['field' => 'zz'], 'field', []],
        ['field', 'ends_with:ing', ['field' => 'zz'], 'field', []],
        ['field', 'in:a,b', ['field' => 'z'], 'field', []],
        ['field', 'same:other', ['field' => 'x', 'other' => 'y'], 'field', []],
        ['field', 'required', [], 'field', []],
        ['field', 'email', ['field' => 'nope'], 'field', []],
        // A human label replaces `:attribute` wherever it appears.
        ['email', 'required', [], 'email', ['email' => 'Email address']],
        ['email', 'max:5', ['email' => 'abcdef'], 'email', ['email' => 'Email address']],
        // Wildcards. The exporter can only key the message by the PATTERN —
        // it describes a rule set and has no submission to expand against —
        // while the failure is reported on the concrete path.
        ['items.*.qty', 'required', ['items' => [['qty' => '']]], 'items.0.qty', []],
        ['items.*.qty', 'max:2', ['items' => [['qty' => 'abcd']]], 'items.0.qty', []],
        ['items.*.qty', 'required', ['items' => [['qty' => 'ok'], ['qty' => '']]], 'items.1.qty', []],
        ['items.*.qty', 'max:2', ['items' => [['qty' => 'abcd']]], 'items.0.qty', ['items.*.qty' => 'Quantity']],
        ['rows.*.cols.*.v', 'required', ['rows' => [['cols' => [['v' => '']]]]], 'rows.0.cols.0.v', []],
    ] as $index => [$attribute, $rule, $data, $errorKey, $attributes]) {
        $validator = Validator::make($data, [$attribute => $rule], [], $attributes);
        $validator->fails();
        $message = $validator->errors()->first($errorKey);

        // A case that produced no failure would assert nothing, and would do it
        // silently — so it is a defect in the case, not something to skip.
        expect($message)->not->toBe('', "no failure produced for {$attribute} => {$rule}");

        $cases[] = [
            'attribute' => $attribute,
            'rule' => $rule,
            'data' => $data,
            'field' => $errorKey,
            'schema' => $exporter->export([$attribute => $rule], attributes: $attributes),
            'laravel' => $message,
            'id' => "message #{$index} {$attribute} => {$rule}",
        ];
    }

    $path = dirname(__DIR__).'/js/tests/fixtures/messages.json';
    file_put_contents($path, json_encode($cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

    expect($cases)->not->toBeEmpty()
        ->and(file_exists($path))->toBeTrue();
});
