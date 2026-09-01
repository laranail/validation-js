<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Simtabi\Laranail\ValidationJs\Providers\ValidationJsServiceProvider;

/**
 * The org naming guard, read from the LIVE registries — never by grepping
 * the provider (a refactor of registration code must not blind it). Every
 * public name this package registers carries the vendor and the slug;
 * registries are flat maps, and a bare name is a silent collision waiting
 * for a sibling package.
 */
it('registers only org-namespaced Artisan commands', function (): void {
    $ours = array_filter(
        array_keys(Artisan::all()),
        static fn (string $name): bool => str_contains($name, 'validation-js'),
    );

    expect($ours)->not->toBeEmpty();

    foreach ($ours as $name) {
        expect($name)->toStartWith('laranail::validation-js.');
    }

    expect($ours)->toContain('laranail::validation-js.export')
        ->toContain('laranail::validation-js.doctor')
        ->toContain('laranail::validation-js.parity');
});

it('renders the Blade component only under the laranail-validation-js prefix', function (): void {
    // The live proof: the namespaced tag compiles and renders the island.
    $rendered = Blade::render(
        '<x-laranail-validation-js::schema :rules="[\'f\' => \'required\']" id="probe" />',
    );

    expect($rendered)->toContain('data-laranail-schema="probe"');

    // And the bare prefix does not exist to collide with anyone.
    expect(fn () => Blade::render('<x-validation-js::schema :rules="[]" id="x" />'))
        ->toThrow(Exception::class);
});

it('names its routes under laranail.validation-js.*', function (): void {
    config()->set('laranail.validation-js.endpoint', [
        'enabled' => true,
        'path' => '/_laranail/validation/schema',
        'schemas' => [],
        'middleware' => [],
    ]);
    config()->set('laranail.validation-js.validate', [
        'enabled' => true,
        'path' => '/_laranail/validation/validate',
        'middleware' => [],
        'throttle' => '30,1',
    ]);
    app()->register(ValidationJsServiceProvider::class, force: true);

    // Fluent ->name() after registration lands in the name table on the
    // next refresh; boot does this for real apps.
    Route::getRoutes()->refreshNameLookups();

    expect(Route::has('laranail.validation-js.schema'))->toBeTrue()
        ->and(Route::has('laranail.validation-js.validate'))->toBeTrue();
});

it('reads configuration only from the flat org key', function (): void {
    expect(config('laranail.validation-js'))->toBeArray()
        ->and(config('validation-js'))->toBeNull();
});
