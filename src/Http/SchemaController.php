<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Simtabi\Laranail\ValidationJs\SchemaFactory;

/**
 * The dynamic schema tier (§5.7.1c) under the §10.1 rules: GET only, the
 * request supplies a KEY resolved through the config allow-list — never a
 * class string, which would be an unintended-instantiation surface — and
 * an unknown key is a bare 404 that echoes nothing. Conditional requests
 * are honoured (`ETag`/304), caching is private: a schema may have been
 * redacted per-user by a SchemaExporting listener.
 *
 * @internal Routed, never called directly; not part of the 1.0 stable API.
 */
final readonly class SchemaController
{
    public function __construct(private SchemaFactory $factory) {}

    public function __invoke(Request $request, string $key): JsonResponse|Response
    {
        $schemas = config('laranail.validation-js.endpoint.schemas', []);
        $class = is_array($schemas) ? ($schemas[$key] ?? null) : null;

        if (! is_string($class)) {
            abort(404);
        }

        $schema = $this->factory->forRequest($class, $key);
        $body = json_encode($schema, JSON_THROW_ON_ERROR);
        $etag = '"'.sha1($body).'"';

        if ($request->headers->get('If-None-Match') === $etag) {
            return response('', 304)->withHeaders([
                'ETag' => $etag,
                'Cache-Control' => 'private, max-age=60',
            ]);
        }

        return response()->json($schema)->withHeaders([
            'ETag' => $etag,
            'Cache-Control' => 'private, max-age=60',
        ]);
    }
}
