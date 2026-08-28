<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Http;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Contracts\Events\Dispatcher;
use Simtabi\Laranail\ValidationJs\RemoteRegistry;
use Simtabi\Laranail\ValidationJs\Events\RemoteValidationAttempted;

/**
 * The thin validate endpoint for registered RuleSets (§5.7.2). The
 * FormRequest world does not come here — Laravel's own
 * HandlePrecognitiveRequests middleware covers it; this exists because
 * RuleSets have no request class to hang that middleware on.
 *
 * §10 discipline: authorization is the registry's REQUIRED callback and
 * runs first; the response shape is UNIFORM — 204, or 422 with an
 * `errors` map, always the same skeleton, so "taken" and "malformed" are
 * indistinguishable to an enumerator by anything but the message the
 * application itself chose to expose. The full payload is validated with
 * `Precognition-Validate-Only` narrowing the REPORTED fields, exactly as
 * Precognition does, so cross-field rules see the whole submission. The
 * monitoring event carries field names and outcome — never values.
 *
 * @internal Routed, never called directly; not part of the 1.0 stable API.
 */
final readonly class ValidateController
{
    public function __construct(
        private RemoteRegistry $registry,
        private Dispatcher $events,
    ) {}

    public function __invoke(Request $request, string $key): JsonResponse|Response
    {
        $entry = $this->registry->get($key);

        if ($entry === null) {
            abort(404);
        }

        $only = array_values(array_filter(array_map(
            trim(...),
            explode(',', (string) $request->headers->get('Precognition-Validate-Only', '')),
        ), static fn (string $field): bool => $field !== ''));

        $authorize = $entry['authorize'];

        if (! $authorize($request)) {
            $this->events->dispatch(new RemoteValidationAttempted($key, $only, 'unauthorized'));

            abort(403);
        }

        $rulesFactory = $entry['rules'];
        $validator = Validator::make($request->all(), $rulesFactory());
        $failures = $validator->errors()->toArray();

        if ($only !== []) {
            $failures = array_intersect_key($failures, array_fill_keys($only, true));
        }

        $outcome = $failures === [] ? 'passed' : 'failed';
        $this->events->dispatch(new RemoteValidationAttempted($key, $only, $outcome));

        if ($failures === []) {
            return response('', 204)->header('Precognition', 'true');
        }

        return response()->json(['errors' => $failures], 422)->header('Precognition', 'true');
    }
}
