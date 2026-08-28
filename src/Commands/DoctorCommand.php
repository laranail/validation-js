<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Commands;

use Illuminate\Foundation\Http\FormRequest;
use Simtabi\Laranail\ValidationJs\RuleExporter;
use Simtabi\Laranail\ValidationJs\RuleCatalogue;
use Simtabi\Laranail\Console\Tools\Commands\Command;
use Simtabi\Laranail\ValidationJs\Support\EngineIntrospection;
use Simtabi\Laranail\Console\Tools\Commands\Concerns\SupportsNamespacedNames;

/**
 * Schema/wire-format health (§5.8): the questions whose silent "no" costs
 * an afternoon — does the exporter's catalogue match what the shipped
 * runner implements, do the two halves declare the same schema major, is
 * the parity fixture present and parseable, and does the endpoint
 * allow-list point at real FormRequests?
 */
final class DoctorCommand extends Command
{
    use SupportsNamespacedNames;

    protected $signature = 'laranail::validation-js.doctor';

    protected $description = 'Check exporter/runner agreement, fixture health, and endpoint configuration.';

    public function handle(): int
    {
        // Every check runs — a doctor that stops at the first symptom
        // reports one problem per visit.
        $checks = [
            $this->checkSchemaVersion(),
            $this->checkCatalogueDrift(),
            $this->checkParityFixture(),
            $this->checkAllowList(),
        ];

        $healthy = ! in_array(false, $checks, true);

        if ($healthy) {
            $this->info('Everything agrees: exporter, runner, fixtures, configuration.');
        }

        return $healthy ? self::SUCCESS : self::FAILURE;
    }

    private function checkSchemaVersion(): bool
    {
        $runner = EngineIntrospection::engineSchemaVersion();

        if ($runner === null) {
            $this->warn('Runner schema version unreadable (js/src/validate.ts not found) — skipped.');

            return true;
        }

        if ($runner !== RuleExporter::VERSION) {
            $this->error('Schema major mismatch: exporter v' . RuleExporter::VERSION . ", runner v{$runner}.");

            return false;
        }

        $this->line('✓ Exporter and runner declare schema v' . RuleExporter::VERSION . '.');

        return true;
    }

    private function checkCatalogueDrift(): bool
    {
        $engine = EngineIntrospection::engineRuleNames();

        if ($engine === []) {
            $this->warn('Engine rule table unreadable (js/src/rules.ts not found) — skipped.');

            return true;
        }

        $missing = array_diff(RuleCatalogue::CLIENT, $engine);
        $extra = array_diff($engine, RuleCatalogue::CLIENT);

        if ($missing !== [] || $extra !== []) {
            if ($missing !== []) {
                $this->error('Catalogue advertises rules the runner cannot evaluate (silent holes): ' . implode(', ', $missing));
            }

            if ($extra !== []) {
                $this->error('Runner implements rules the catalogue withholds (needless round trips): ' . implode(', ', $extra));
            }

            return false;
        }

        $this->line('✓ Catalogue and runner agree on ' . count($engine) . ' client rules.');

        return true;
    }

    private function checkParityFixture(): bool
    {
        $path = EngineIntrospection::packageRoot() . '/js/tests/fixtures/parity.json';

        if (! is_file($path)) {
            $this->warn('Parity fixture not present (packaged installs may omit it) — skipped.');

            return true;
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded) || $decoded === []) {
            $this->error('Parity fixture exists but is empty or unparseable — regenerate with laranail::validation-js.parity.');

            return false;
        }

        $this->line('✓ Parity fixture holds ' . count($decoded) . ' recorded verdicts.');

        return true;
    }

    private function checkAllowList(): bool
    {
        $schemas = config('laranail.validation-js.endpoint.schemas', []);
        $schemas = is_array($schemas) ? $schemas : [];
        $healthy = true;

        foreach ($schemas as $key => $class) {
            if (! is_string($class) || ! class_exists($class)) {
                $this->error("Allow-list entry [{$key}] names a class that does not exist.");
                $healthy = false;

                continue;
            }

            if (! is_subclass_of($class, FormRequest::class)) {
                $this->error("Allow-list entry [{$key}] is not a FormRequest — the schema factory will refuse it.");
                $healthy = false;
            }
        }

        if ($healthy) {
            $this->line('✓ Endpoint allow-list: ' . count($schemas) . ' entr' . (count($schemas) === 1 ? 'y' : 'ies') . ', all resolvable FormRequests.');
        }

        return $healthy;
    }
}
