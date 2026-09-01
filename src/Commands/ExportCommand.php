<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Commands;

use Simtabi\Laranail\Console\Tools\Commands\Command;
use Simtabi\Laranail\Console\Tools\Commands\Concerns\SupportsNamespacedNames;
use Simtabi\Laranail\ValidationJs\SchemaFactory;

/**
 * The static delivery tier (§5.7.1b): write allow-listed schemas to JSON
 * files a bundler ships, for the applications that want no runtime
 * endpoint at all. Reads the SAME allow-list the dynamic endpoint uses,
 * so "what is exportable" has one definition.
 */
final class ExportCommand extends Command
{
    use SupportsNamespacedNames;

    protected $signature = 'laranail::validation-js.export
        {key? : One allow-listed schema key; omit for all}
        {--out=resources/js/schemas : Directory the JSON files land in}';

    protected $description = 'Write allow-listed validation schemas to static JSON files.';

    public function handle(SchemaFactory $factory): int
    {
        $schemas = config('laranail.validation-js.endpoint.schemas', []);
        $schemas = is_array($schemas) ? $schemas : [];

        $key = $this->argument('key');
        $selected = is_string($key) ? array_intersect_key($schemas, [$key => true]) : $schemas;

        if ($selected === []) {
            $this->error(is_string($key)
                ? "No allow-listed schema named [{$key}]. Add it to laranail.validation-js.endpoint.schemas."
                : 'No schemas allow-listed. Add key => FormRequest entries to laranail.validation-js.endpoint.schemas.');

            return self::FAILURE;
        }

        $out = $this->option('out');
        $directory = base_path(is_string($out) ? $out : 'resources/js/schemas');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        foreach ($selected as $name => $class) {
            if (! is_string($class)) {
                continue;
            }

            $schema = $factory->forRequest($class, (string) $name);
            $path = $directory.'/'.$name.'.json';
            file_put_contents($path, json_encode($schema, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            $this->info("Wrote {$path}");
        }

        return self::SUCCESS;
    }
}
