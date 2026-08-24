<?php

declare(strict_types=1);
use Simtabi\Laranail\ValidationJs\Commands\DoctorCommand;
use Simtabi\Laranail\ValidationJs\Commands\ExportCommand;
use Simtabi\Laranail\ValidationJs\Commands\ParityCommand;
use Simtabi\Laranail\ValidationJs\Events\RemoteValidationAttempted;
use Simtabi\Laranail\ValidationJs\Events\SchemaExported;
use Simtabi\Laranail\ValidationJs\Events\SchemaExporting;
use Simtabi\Laranail\ValidationJs\RemoteRegistry;
use Simtabi\Laranail\ValidationJs\RuleExporter;
use Simtabi\Laranail\ValidationJs\SchemaExportException;
use Simtabi\Laranail\ValidationJs\SchemaFactory;
use Simtabi\Laranail\ValidationJs\Support\RendersSchemas;
use Simtabi\Laranail\ValidationJs\ValidationJsServiceProvider;

/**
 * The §12.1 boundary, enforced: every class is either on the stable list
 * (SemVer-covered from 1.0) or carries `@internal`. A class in neither
 * set is an unclassified surface — decide before shipping it, because a
 * consumer will build on whatever is public and unmarked.
 */
const STABLE = [
    RuleExporter::class,
    SchemaFactory::class,
    SchemaExportException::class,
    RemoteRegistry::class,
    ValidationJsServiceProvider::class,
    SchemaExporting::class,
    SchemaExported::class,
    RemoteValidationAttempted::class,
    RendersSchemas::class,
    ExportCommand::class,
    DoctorCommand::class,
    ParityCommand::class,
];

it('classifies every class as stable or @internal — nothing unmarked', function (): void {
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(dirname(__DIR__).'/src', FilesystemIterator::SKIP_DOTS),
    );

    $unclassified = [];

    foreach ($files as $file) {
        if (! $file instanceof SplFileInfo || $file->getExtension() !== 'php') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());

        if (preg_match('/^namespace ([^;]+);/m', $source, $ns) !== 1
            || preg_match('/^(?:final |abstract )*(?:readonly )?class (\w+)/m', $source, $cls) !== 1) {
            continue;
        }

        $fqn = $ns[1].'\\'.$cls[1];
        $reflection = new ReflectionClass($fqn);
        $internal = str_contains((string) $reflection->getDocComment(), '@internal');
        $stable = in_array($fqn, STABLE, true);

        if ($stable && $internal) {
            $unclassified[] = "{$fqn} is on the stable list AND marked @internal — pick one.";
        }

        if (! $stable && ! $internal) {
            $unclassified[] = "{$fqn} is public but neither stable-listed nor @internal.";
        }
    }

    expect($unclassified)->toBe([]);
});
