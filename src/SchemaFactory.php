<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

use Throwable;
use Illuminate\Http\Request;
use Illuminate\Routing\Redirector;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Contracts\Container\Container;
use Simtabi\Laranail\ValidationJs\Events\SchemaExported;
use Simtabi\Laranail\ValidationJs\Events\SchemaExporting;

/**
 * The one path every delivery tier exports through — inline Blade, the
 * static export command, and the dynamic endpoint all call here, which is
 * what makes the {@see SchemaExporting} redaction seam a guarantee rather
 * than a convention: a listener's decision applies to every tier because
 * no tier can reach the exporter around it.
 */
final readonly class SchemaFactory
{
    public function __construct(
        private Container $container,
        private RuleExporter $exporter,
        private Dispatcher $events,
    ) {}

    /**
     * @param array<string, mixed> $rules
     * @param array<string, string> $messages
     * @param array<string, string> $attributes
     * @param list<string> $except Fields exported server-only — the per-field opt-out
     *                             (the field degrades to undetermined, never green).
     *
     * @return array<string, mixed>
     */
    public function forRules(
        array $rules,
        array $messages = [],
        array $attributes = [],
        ?string $key = null,
        array $except = [],
    ): array {
        $exporting = new SchemaExporting($rules, $messages, $attributes, $key);
        $this->events->dispatch($exporting);

        $schema = $this->exporter->export(
            $exporting->rules,
            $exporting->messages,
            $exporting->attributes,
            $except,
        );

        $this->events->dispatch(new SchemaExported($schema, $key));

        return $schema;
    }

    /**
     * A FormRequest's schema — CONTAINER-BUILT and hydrated, which is the
     * subtle part: `rules()` may read `$this->route(...)`, `$this->user()`
     * or `$this->input(...)`, so reflecting rules off a bare `new
     * StoreUserRequest()` throws or returns the wrong rule set. The
     * instance is created from the current request with the container's
     * redirector attached, then `rules()` is invoked THROUGH the container
     * so its own dependencies inject.
     *
     * A `rules()` that still cannot run outside a real request becomes a
     * {@see SchemaExportException} naming the request class — never a
     * silent empty schema, which would switch client validation off while
     * looking configured.
     *
     * @param string $requestClass Validated here: a non-FormRequest name throws.
     *
     * @return array<string, mixed>
     */
    public function forRequest(string $requestClass, ?string $key = null): array
    {
        if (! is_subclass_of($requestClass, FormRequest::class)) {
            throw new SchemaExportException(
                "[{$requestClass}] is not a FormRequest; the schema factory exports rules()-carrying requests.",
            );
        }

        $current = $this->container->make(Request::class);

        /** @var FormRequest $request */
        $request = $requestClass::createFrom($current);
        $request->setContainer($this->container);
        $request->setRedirector($this->container->make(Redirector::class));

        if (! method_exists($request, 'rules')) {
            throw new SchemaExportException(
                "[{$requestClass}] declares no rules(); there is nothing to export.",
            );
        }

        try {
            $rules = $this->container->call([$request, 'rules']);
            $messages = method_exists($request, 'messages') ? $request->messages() : [];
            $attributes = method_exists($request, 'attributes') ? $request->attributes() : [];
        } catch (Throwable $exception) {
            throw new SchemaExportException(
                "[{$requestClass}::rules()] could not run outside a live request"
                    . ' — it likely reads route parameters or input that only exist mid-request.'
                    . ' Export a RuleSet for this form, or guard those reads.',
                previous: $exception,
            );
        }

        $ruleSet = [];

        if (is_array($rules)) {
            foreach ($rules as $field => $rule) {
                if (is_string($field)) {
                    $ruleSet[$field] = $rule;
                }
            }
        }

        return $this->forRules(
            $ruleSet,
            is_array($messages) ? $messages : [],
            is_array($attributes) ? $attributes : [],
            $key,
        );
    }
}
