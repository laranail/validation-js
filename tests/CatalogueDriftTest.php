<?php

declare(strict_types=1);

use Simtabi\Laranail\ValidationJs\RuleExporter;
use Simtabi\Laranail\ValidationJs\RuleCatalogue;
use Simtabi\Laranail\ValidationJs\Support\EngineIntrospection;

/**
 * The §7.2 drift guard: `RuleCatalogue::CLIENT` and the JS engine's
 * `checks` map must agree EXACTLY. A rule the exporter advertises as
 * client-side but the runner cannot evaluate is a silent hole — the field
 * shows a green tick the server contradicts; a rule the runner implements
 * but the catalogue withholds silently round-trips work the browser could
 * decide. Adding a client rule is a three-part change (catalogue + engine
 * + fixtures) and this test refuses it partially done.
 */
it('keeps the exporter catalogue and the JS engine in exact agreement', function (): void {
    $engine = EngineIntrospection::engineRuleNames();
    $catalogue = RuleCatalogue::CLIENT;

    expect($engine)->not->toBeEmpty('The engine source could not be parsed — the guard has lost its teeth.');

    sort($engine);
    sort($catalogue);

    expect($engine)->toBe($catalogue);
});

it('keeps the exporter and the runner on the same schema major', function (): void {
    expect(EngineIntrospection::engineSchemaVersion())->toBe(RuleExporter::VERSION);
});
