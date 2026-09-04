<?php

declare(strict_types=1);

/*
 * Read under the flat `laranail.validation-js.*` key, per the org config
 * convention; the file is prefixed so `vendor:publish` cannot clobber an
 * application's own config.
 */
return [

    /*
     * The dynamic schema endpoint (§5.7 tier c). DISABLED by default: it is
     * an opt-in surface, and enabling it means choosing which FormRequests
     * become browsable. Schemas resolve ONLY through this key → class
     * allow-list; the request supplies a key, never a class name.
     */
    'endpoint' => [
        'enabled' => false,
        'path'    => '/_laranail/validation/schema',
        // 'signup' => \App\Http\Requests\StoreUserRequest::class,
        'schemas' => [],
        // Middleware wrapped around the route — put your auth here.
        'middleware' => ['web'],
    ],

    /*
     * The remote validate endpoint for RuleSets (§5.7.2). Also opt-in, and
     * a registered RuleSet MUST carry its own authorization callback —
     * RuleSets have no authorize(), so the endpoint refuses to register one
     * without it (fail closed at boot, §10.2).
     */
    'validate' => [
        'enabled'    => false,
        'path'       => '/_laranail/validation/validate',
        'middleware' => ['web'],
        'throttle'   => '30,1',
    ],

    /*
     * Defaults surfaced to the browser runtime when the Blade component
     * renders configuration alongside the schema.
     */
    'runtime' => [
        'mode'     => 'eager',
        'debounce' => 300,
    ],
];
