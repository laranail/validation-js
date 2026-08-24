<?php

declare(strict_types=1);

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Simtabi\Laranail\ValidationJs\Events\RemoteValidationAttempted;
use Simtabi\Laranail\ValidationJs\Events\SchemaExported;
use Simtabi\Laranail\ValidationJs\Events\SchemaExporting;
use Simtabi\Laranail\ValidationJs\RemoteRegistry;
use Simtabi\Laranail\ValidationJs\SchemaExportException;
use Simtabi\Laranail\ValidationJs\SchemaFactory;
use Simtabi\Laranail\ValidationJs\Support\RendersSchemas;
use Simtabi\Laranail\ValidationJs\ValidationJsServiceProvider;

final class StoreThingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->headers->get('X-Allowed') === 'yes';
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['email' => 'required|email|max:64', 'name' => 'required|string'];
    }
}

final class RouteReadingRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        throw new RuntimeException('needs a live route');
    }
}

// =========================================================================
// SchemaFactory — hydration, events, loud failure
// =========================================================================

it('exports a container-built FormRequest through the factory', function (): void {
    $schema = app(SchemaFactory::class)->forRequest(StoreThingRequest::class);

    expect($schema['fields'])->toHaveKeys(['email', 'name'])
        ->and($schema['fields']['email']['client'])->toContain(['rule' => 'email', 'params' => []]);
});

it('lets a SchemaExporting listener redact before any tier sees the schema', function (): void {
    Event::listen(SchemaExporting::class, function (SchemaExporting $event): void {
        unset($event->rules['email']);
    });

    $schema = app(SchemaFactory::class)->forRequest(StoreThingRequest::class);

    expect($schema['fields'])->toHaveKey('name')->not->toHaveKey('email');
});

it('announces the finished document through SchemaExported', function (): void {
    Event::fake([SchemaExported::class]);

    app(SchemaFactory::class)->forRequest(StoreThingRequest::class, 'signup');

    Event::assertDispatched(
        SchemaExported::class,
        static fn (SchemaExported $event): bool => $event->key === 'signup'
            && array_key_exists('fields', $event->schema),
    );
});

it('fails loudly, never silently empty, when rules() cannot run', function (): void {
    app(SchemaFactory::class)->forRequest(RouteReadingRequest::class);
})->throws(SchemaExportException::class, 'RouteReadingRequest');

it('refuses to export a class that is not a FormRequest', function (): void {
    app(SchemaFactory::class)->forRequest(stdClass::class);
})->throws(SchemaExportException::class);

// =========================================================================
// Inline tier — directive/component island (§10.5)
// =========================================================================

it('renders an inert JSON island with the nonce threaded', function (): void {
    $html = RendersSchemas::directive(['email' => 'required|email'], 'signup', 'abc123');

    expect($html)->toStartWith('<script type="application/json" data-laranail-schema="signup" nonce="abc123">')
        ->toEndWith('</script>')
        ->and($html)->toContain('"version":1');
});

it('keeps a hostile message from terminating the script block', function (): void {
    $html = RendersSchemas::directive(
        ['f' => 'required'],
        'x',
        null,
    );

    // The factory path uses toJson-equivalent HEX flags; simulate the
    // worst case directly through the island renderer.
    $island = RendersSchemas::island(
        ['messages' => ['f.required' => '</script><script>alert(1)</script>']],
        'x',
        null,
    );

    expect($island)->not->toContain('</script><script>')
        ->and($html)->toStartWith('<script type="application/json"');
});

it('renders the same island through the Blade component and directive', function (): void {
    $rendered = Blade::render(
        '<x-laranail-validation-js::schema :rules="[\'email\' => \'required\']" id="cmp" />',
    );

    expect($rendered)->toContain('data-laranail-schema="cmp"')
        ->and($rendered)->toContain('"version":1');
});

// =========================================================================
// Dynamic schema endpoint (§10.1)
// =========================================================================

function enableSchemaEndpoint(): void
{
    config()->set('laranail.validation-js.endpoint', [
        'enabled' => true,
        'path' => '/_laranail/validation/schema',
        'schemas' => ['signup' => StoreThingRequest::class],
        'middleware' => [],
    ]);

    // Routes register at boot; re-boot the provider with the new config.
    app()->register(ValidationJsServiceProvider::class, force: true);
}

it('is disabled by default — no route exists', function (): void {
    expect(Route::has('laranail.validation-js.schema'))->toBeFalse();

    $this->get('/_laranail/validation/schema/signup')->assertNotFound();
});

it('serves only allow-listed keys, never class strings', function (): void {
    enableSchemaEndpoint();

    $this->get('/_laranail/validation/schema/signup')
        ->assertOk()
        ->assertJsonPath('version', 1)
        ->assertJsonStructure(['fields' => ['email', 'name']]);

    // An unknown key — including an attempted class-string — is a bare 404.
    $this->get('/_laranail/validation/schema/unknown')->assertNotFound();
    $this->get('/_laranail/validation/schema/'.urlencode(StoreThingRequest::class))->assertNotFound();
});

it('strips server-rule parameters on the wire — the §10.1 guarantee at the endpoint', function (): void {
    config()->set('laranail.validation-js.endpoint', [
        'enabled' => true,
        'path' => '/_laranail/validation/schema',
        'schemas' => ['users' => UniqueCarryingRequest::class],
        'middleware' => [],
    ]);
    app()->register(ValidationJsServiceProvider::class, force: true);

    $response = $this->get('/_laranail/validation/schema/users');
    assert($response instanceof TestResponse);
    $response->assertOk();
    $body = (string) $response->baseResponse->getContent();

    expect($body)->toContain('"unique"');
    expect($body)->not->toContain('users,email');
    expect($body)->not->toContain('secret_column');
});

it('honours conditional requests with a stable ETag', function (): void {
    enableSchemaEndpoint();

    $first = $this->get('/_laranail/validation/schema/signup');
    assert($first instanceof TestResponse);
    $etag = (string) $first->baseResponse->headers->get('ETag');

    expect($etag)->not->toBe('');
    expect((string) $first->baseResponse->headers->get('Cache-Control'))->toContain('private');

    $this->get('/_laranail/validation/schema/signup', ['If-None-Match' => $etag])
        ->assertStatus(304);
});

final class UniqueCarryingRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['email' => 'required|email|unique:users,secret_column'];
    }
}

// =========================================================================
// Validate endpoint (§10.2, §10.3)
// =========================================================================

function enableValidateEndpoint(?Closure $authorize = null): void
{
    config()->set('laranail.validation-js.validate', [
        'enabled' => true,
        'path' => '/_laranail/validation/validate',
        'middleware' => [],
        'throttle' => '3,1',
    ]);

    app()->register(ValidationJsServiceProvider::class, force: true);

    app(RemoteRegistry::class)->register(
        'profile',
        static fn (): array => ['email' => 'required|email', 'age' => 'nullable|integer'],
        $authorize ?? static fn (): bool => true,
    );
}

it('validates a registered RuleSet with the uniform outcome shape', function (): void {
    enableValidateEndpoint();

    $this->postJson('/_laranail/validation/validate/profile', ['email' => 'a@b.co'])
        ->assertStatus(204)
        ->assertHeader('Precognition', 'true');

    // "Malformed" and "missing" produce the SAME skeleton — an enumerator
    // learns nothing from the shape.
    $malformed = $this->postJson('/_laranail/validation/validate/profile', ['email' => 'nope']);
    $missing = $this->postJson('/_laranail/validation/validate/profile', []);

    $malformed->assertStatus(422)->assertJsonStructure(['errors' => ['email']]);
    $missing->assertStatus(422)->assertJsonStructure(['errors' => ['email']]);
    expect(array_keys($malformed->json()))->toBe(array_keys($missing->json()));
});

it('narrows REPORTED failures to the Validate-Only list while validating everything', function (): void {
    enableValidateEndpoint();

    $response = $this->postJson(
        '/_laranail/validation/validate/profile',
        ['email' => 'nope', 'age' => 'not-a-number'],
        ['Precognition-Validate-Only' => 'age'],
    );

    $response->assertStatus(422);
    expect($response->json('errors'))->toHaveKey('age')->not->toHaveKey('email');
});

it('runs the registry authorization first and uniformly 403s', function (): void {
    enableValidateEndpoint(static fn (Request $request): bool => $request->headers->get('X-Allowed') === 'yes');

    $this->postJson('/_laranail/validation/validate/profile', ['email' => 'a@b.co'])
        ->assertStatus(403);

    $this->postJson('/_laranail/validation/validate/profile', ['email' => 'a@b.co'], ['X-Allowed' => 'yes'])
        ->assertStatus(204);
});

it('throttles probing', function (): void {
    enableValidateEndpoint();

    foreach (range(1, 3) as $i) {
        $this->postJson('/_laranail/validation/validate/profile', ['email' => 'a@b.co'])->assertStatus(204);
    }

    $this->postJson('/_laranail/validation/validate/profile', ['email' => 'a@b.co'])->assertStatus(429);
});

it('monitors attempts with field names and outcomes — never values', function (): void {
    enableValidateEndpoint();
    Event::fake([RemoteValidationAttempted::class]);

    $this->postJson(
        '/_laranail/validation/validate/profile',
        ['email' => 'hunter2@secret.example'],
        ['Precognition-Validate-Only' => 'email'],
    )->assertStatus(204);

    Event::assertDispatched(RemoteValidationAttempted::class, static function (RemoteValidationAttempted $event): bool {
        $serialised = json_encode([$event->endpoint, $event->fields, $event->outcome]);

        return $event->outcome === 'passed'
            && $event->fields === ['email']
            && ! str_contains((string) $serialised, 'hunter2');
    });
});

it('404s an unregistered key', function (): void {
    enableValidateEndpoint();

    $this->postJson('/_laranail/validation/validate/other', [])->assertNotFound();
});

// =========================================================================
// FormRequest path — Laravel's own Precognition middleware round trip
// =========================================================================

it('round-trips Precognition for a FormRequest: validate-only, full payload, no controller', function (): void {
    $controllerRan = false;

    Route::post('/things', function (StoreThingRequest $request) use (&$controllerRan) {
        $controllerRan = true;

        return response()->json(['stored' => true]);
    })->middleware([HandlePrecognitiveRequests::class]);

    // Authorization is the FormRequest's own — inherited for free.
    $this->postJson('/things', ['email' => 'nope'], [
        'Precognition' => 'true',
        'Precognition-Validate-Only' => 'email',
        'X-Allowed' => 'yes',
    ])
        ->assertStatus(422)
        ->assertJsonStructure(['errors' => ['email']]);

    $this->postJson('/things', ['email' => 'a@b.co', 'name' => 'Alice'], [
        'Precognition' => 'true',
        'X-Allowed' => 'yes',
    ])->assertStatus(204);

    expect($controllerRan)->toBeFalse();

    // Denied authorization stays denied under precognition.
    $this->postJson('/things', ['email' => 'a@b.co', 'name' => 'Alice'], [
        'Precognition' => 'true',
    ])->assertStatus(403);
});

// =========================================================================
// Static tier — the export command
// =========================================================================

it('writes allow-listed schemas to static JSON through the org-named command', function (): void {
    config()->set('laranail.validation-js.endpoint.schemas', ['signup' => StoreThingRequest::class]);
    $out = 'exported-'.uniqid();

    $this->artisan('laranail::validation-js.export', ['--out' => $out])
        ->assertSuccessful();

    $path = base_path($out.'/signup.json');
    $written = json_decode((string) file_get_contents($path), true);

    expect($written)->toHaveKey('fields')
        ->and($written['version'])->toBe(1);

    unlink($path);
    rmdir(base_path($out));
});

it('refuses to export an unlisted key', function (): void {
    $this->artisan('laranail::validation-js.export', ['key' => 'nope'])->assertFailed();
});
