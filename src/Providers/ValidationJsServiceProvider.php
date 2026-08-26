<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Providers;

use Illuminate\Contracts\Translation\Translator;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Simtabi\Laranail\Package\Tools\Package;
use Simtabi\Laranail\Package\Tools\Providers\PackageServiceProvider;
use Simtabi\Laranail\ValidationJs\Commands\DoctorCommand;
use Simtabi\Laranail\ValidationJs\Commands\ExportCommand;
use Simtabi\Laranail\ValidationJs\Commands\ParityCommand;
use Simtabi\Laranail\ValidationJs\Http\SchemaController;
use Simtabi\Laranail\ValidationJs\Http\ValidateController;
use Simtabi\Laranail\ValidationJs\RemoteRegistry;
use Simtabi\Laranail\ValidationJs\RuleExporter;
use Simtabi\Laranail\ValidationJs\SchemaFactory;

/**
 * The exporter, and — new with the transport phase — the Laravel surface
 * around it: config, the inline Blade tier, the static export command, and
 * the two OPT-IN routes. Everything web-facing is disabled by default and
 * resolves through allow-lists; see the §10 threat model in the design
 * folder for why each shape is what it is.
 */
class ValidationJsServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package->name('laranail/validation-js');
    }

    public function registeringPackage(): void
    {
        // The prefixed file with the flat org key — the same shape (and
        // reasoning) as laranail/validation's own config registration.
        $this->mergeConfigFrom($this->configPath(), 'laranail.validation-js');

        $this->app->singleton(RuleExporter::class, function (): RuleExporter {
            $translator = $this->app->make(Translator::class);

            return new RuleExporter($translator instanceof Translator ? $translator : null);
        });

        $this->app->singleton(SchemaFactory::class);
        $this->app->singletonIf(RemoteRegistry::class);
    }

    public function bootingPackage(): void
    {
        $this->registerBladeSurface();
        $this->registerRoutes();

        if ($this->app->runningInConsole()) {
            $this->publishes(
                [$this->configPath() => config_path('laranail-validation-js.php')],
                $this->package->getNamespacedPublishTag('config'),
            );

            $this->commands([ExportCommand::class, DoctorCommand::class, ParityCommand::class]);
        }
    }

    /**
     * `@laranailValidation($rulesOrRequestClass, nonce: …)` and the
     * anonymous `<x-laranail-validation-js::schema>` component — both
     * render the same inert JSON data island through the same factory.
     */
    private function registerBladeSurface(): void
    {
        Blade::anonymousComponentPath(
            dirname(__DIR__, 2).'/resources/views/components',
            'laranail-validation-js',
        );

        Blade::directive('laranailValidation', static function (string $expression): string {
            return "<?php echo \Simtabi\Laranail\ValidationJs\Support\RendersSchemas::directive({$expression}); ?>";
        });
    }

    private function registerRoutes(): void
    {
        $endpoint = config('laranail.validation-js.endpoint');

        if (is_array($endpoint) && ($endpoint['enabled'] ?? false) === true) {
            $path = is_string($endpoint['path'] ?? null) ? $endpoint['path'] : '/_laranail/validation/schema';
            $middleware = array_values(array_filter(
                is_array($endpoint['middleware'] ?? null) ? $endpoint['middleware'] : ['web'],
                is_string(...),
            ));

            Route::get(rtrim($path, '/').'/{key}', SchemaController::class)
                ->middleware($middleware)
                ->name('laranail.validation-js.schema');
        }

        $validate = config('laranail.validation-js.validate');

        if (is_array($validate) && ($validate['enabled'] ?? false) === true) {
            $path = is_string($validate['path'] ?? null) ? $validate['path'] : '/_laranail/validation/validate';
            $middleware = array_values(array_filter(
                is_array($validate['middleware'] ?? null) ? $validate['middleware'] : ['web'],
                is_string(...),
            ));
            $throttle = is_string($validate['throttle'] ?? null) ? $validate['throttle'] : '30,1';

            Route::post(rtrim($path, '/').'/{key}', ValidateController::class)
                ->middleware([...$middleware, 'throttle:'.$throttle])
                ->name('laranail.validation-js.validate');
        }
    }

    private function configPath(): string
    {
        return dirname(__DIR__, 2).'/config/laranail-validation-js.php';
    }
}
