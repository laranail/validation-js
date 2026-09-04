<?php

declare(strict_types=1);

use Simtabi\Laranail\ValidationJs\RuleCatalogue;

/**
 * Numbers stated in prose drift the moment the code moves — the README
 * claimed 266 fixtures while the file held 299, and the CHANGELOG counted
 * 60 client rules against a catalogue of 61. Nobody notices, because
 * nothing fails. These tests make every stated count a claim CI checks
 * against the live source, so growing the grid or the catalogue without
 * updating the prose is a red build, not silent rot.
 */
it('states the real parity-fixture count in the README and CHANGELOG', function (): void {
    $fixtures = json_decode(
        (string) file_get_contents(dirname(__DIR__) . '/js/tests/fixtures/parity.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $actual = count($fixtures);

    foreach (['README.md', 'CHANGELOG.md'] as $doc) {
        $prose = (string) file_get_contents(dirname(__DIR__) . '/' . $doc);

        // \s+ because hard-wrapped prose can break the line inside the phrase.
        preg_match_all('/(\d+)\s+rule-and-value\s+combinations/', $prose, $m);

        expect($m[1])->not->toBeEmpty("{$doc} no longer states the fixture count this test pins.");

        foreach ($m[1] as $stated) {
            expect((int) $stated)->toBe(
                $actual,
                "{$doc} claims {$stated} rule-and-value combinations; parity.json holds {$actual}.",
            );
        }
    }
});

it('states the real client-rule count in the CHANGELOG', function (): void {
    $actual = count(RuleCatalogue::CLIENT);
    $prose = (string) file_get_contents(dirname(__DIR__) . '/CHANGELOG.md');

    preg_match_all('/implementing (\d+) rules/', $prose, $m);

    expect($m[1])->not->toBeEmpty();

    foreach ($m[1] as $stated) {
        expect((int) $stated)->toBe(
            $actual,
            "CHANGELOG claims {$stated} client rules; RuleCatalogue::CLIENT holds {$actual}.",
        );
    }
});

it('exercises every client-checkable rule in the parity grid', function (): void {
    // The exit criterion of the client-engine phase, made a guard: a rule the
    // catalogue calls client-checkable but the grid never runs is an
    // implementation nobody has compared with Laravel.
    $cases = json_decode(
        (string) file_get_contents(dirname(__DIR__) . '/js/tests/fixtures/parity.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    $exercised = [];

    foreach (is_array($cases) ? $cases : [] as $case) {
        $fields = is_array($case) ? ($case['schema']['fields'] ?? null) : null;

        foreach (is_array($fields) ? $fields : [] as $field) {
            $client = is_array($field) ? ($field['client'] ?? null) : null;

            foreach (is_array($client) ? $client : [] as $clientRule) {
                $rule = is_array($clientRule) ? ($clientRule['rule'] ?? null) : null;

                if (is_string($rule)) {
                    $exercised[$rule] = true;
                }
            }
        }
    }

    // Structural rules never produce a verdict to compare; the file family
    // cannot ride JSON and is pinned by js/tests/files.test.ts instead.
    $exempt = ['nullable', 'sometimes', 'file', 'mimes', 'extensions', 'image', 'dimensions'];

    $unexercised = array_diff(RuleCatalogue::CLIENT, array_keys($exercised), $exempt);

    expect(array_values($unexercised))->toBeEmpty(
        'client rules absent from the parity grid: ' . implode(', ', $unexercised),
    );
});
