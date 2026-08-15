<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

use Illuminate\Contracts\Translation\Translator;
use Simtabi\Laranail\Package\Tools\Package;
use Simtabi\Laranail\Package\Tools\Providers\PackageServiceProvider;

/**
 * Registers the exporter. There is nothing else to wire: the schema is data,
 * and the runner is JavaScript.
 */
class ValidationJsServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package->name('laranail/validation-js');
    }

    public function registeringPackage(): void
    {
        $this->app->singleton(RuleExporter::class, function (): RuleExporter {
            $translator = $this->app->make(Translator::class);

            return new RuleExporter($translator instanceof Translator ? $translator : null);
        });
    }
}
