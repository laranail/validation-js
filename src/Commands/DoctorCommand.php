<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Commands;

use Illuminate\Foundation\Http\FormRequest;
use Simtabi\Laranail\Console\Tools\Commands\Command;
use Simtabi\Laranail\Console\Tools\Commands\Concerns\SupportsNamespacedNames;
use Simtabi\Laranail\Package\Tools\Services\Doctor\Checks\CallbackCheck;
use Simtabi\Laranail\Package\Tools\Services\Doctor\DoctorReporter;
use Simtabi\Laranail\Package\Tools\Services\Doctor\DoctorResult;
use Simtabi\Laranail\ValidationJs\RuleCatalogue;
use Simtabi\Laranail\ValidationJs\RuleExporter;
use Simtabi\Laranail\ValidationJs\Support\EngineIntrospection;

/**
 * Schema/wire-format health (§5.8): the questions whose silent "no" costs
 * an afternoon — does the exporter's catalogue match what the shipped
 * runner implements, do the two halves declare the same schema major, is
 * the parity fixture present and parseable, and does the endpoint
 * allow-list point at real FormRequests?
 *
 * Rendering is `package-tools`' shared doctor subsystem, so the output, the
 * `--json` form and the exit code match every other package in the family.
 *
 * That swap also fixed a real defect. Each check used to return `bool` and print
 * as it went, so "unreadable, skipped" returned `true` and counted as healthy —
 * a missing runner file reported the package as fine. Those are now `Warn`,
 * which is a distinct state from `Pass` and cannot be mistaken for one.
 */
final class DoctorCommand extends Command
{
    use SupportsNamespacedNames;

    protected $signature = 'laranail::validation-js.doctor {--json : Emit the report as JSON}';

    protected $description = 'Check exporter/runner agreement, fixture health, and endpoint configuration.';

    public function handle(): int
    {
        return DoctorReporter::render($this, $this->checks(), (bool) $this->option('json'));
    }

    /**
     * Every check runs — a doctor that stops at the first symptom reports one
     * problem per visit.
     *
     * @return list<CallbackCheck>
     */
    private function checks(): array
    {
        return [
            new CallbackCheck(
                'validation-js:schema-version',
                'Exporter and runner declare the same schema major',
                $this->checkSchemaVersion(...),
            ),
            new CallbackCheck(
                'validation-js:catalogue-drift',
                'The catalogue and the runner agree on the client rule set',
                $this->checkCatalogueDrift(...),
            ),
            new CallbackCheck(
                'validation-js:parity-fixture',
                'The recorded parity verdicts are present and parseable',
                $this->checkParityFixture(...),
            ),
            new CallbackCheck(
                'validation-js:endpoint-allow-list',
                'Every allow-listed schema resolves to a FormRequest',
                $this->checkAllowList(...),
            ),
        ];
    }

    private function checkSchemaVersion(): DoctorResult
    {
        $runner = EngineIntrospection::engineSchemaVersion();

        if ($runner === null) {
            return DoctorResult::warn('Runner schema version unreadable (js/src/validate.ts not found).');
        }

        if ($runner !== RuleExporter::VERSION) {
            return DoctorResult::fail(
                'Schema major mismatch: exporter v'.RuleExporter::VERSION.", runner v{$runner}.",
            );
        }

        return DoctorResult::pass('Exporter and runner declare schema v'.RuleExporter::VERSION.'.');
    }

    private function checkCatalogueDrift(): DoctorResult
    {
        $engine = EngineIntrospection::engineRuleNames();

        if ($engine === []) {
            return DoctorResult::warn('Engine rule table unreadable (js/src/rules.ts not found).');
        }

        $missing = array_diff(RuleCatalogue::CLIENT, $engine);
        $extra = array_diff($engine, RuleCatalogue::CLIENT);

        if ($missing !== [] || $extra !== []) {
            $detail = [];

            if ($missing !== []) {
                $detail['silent holes'] = 'catalogue advertises rules the runner cannot evaluate: '.implode(', ', $missing);
            }

            if ($extra !== []) {
                $detail['needless round trips'] = 'runner implements rules the catalogue withholds: '.implode(', ', $extra);
            }

            return DoctorResult::fail('Catalogue and runner disagree.', $detail);
        }

        return DoctorResult::pass('Catalogue and runner agree on '.count($engine).' client rules.');
    }

    private function checkParityFixture(): DoctorResult
    {
        $path = EngineIntrospection::packageRoot().'/js/tests/fixtures/parity.json';

        if (! is_file($path)) {
            return DoctorResult::warn('Parity fixture not present (packaged installs may omit it).');
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded) || $decoded === []) {
            return DoctorResult::fail(
                'Parity fixture exists but is empty or unparseable — regenerate with laranail::validation-js.parity.',
            );
        }

        return DoctorResult::pass('Parity fixture holds '.count($decoded).' recorded verdicts.');
    }

    private function checkAllowList(): DoctorResult
    {
        $schemas = config('laranail.validation-js.endpoint.schemas', []);
        $schemas = is_array($schemas) ? $schemas : [];

        $problems = [];

        foreach ($schemas as $key => $class) {
            if (! is_string($class) || ! class_exists($class)) {
                $problems[(string) $key] = 'names a class that does not exist';

                continue;
            }

            if (! is_subclass_of($class, FormRequest::class)) {
                $problems[(string) $key] = 'is not a FormRequest — the schema factory will refuse it';
            }
        }

        if ($problems !== []) {
            return DoctorResult::fail('Endpoint allow-list has unusable entries.', $problems);
        }

        return DoctorResult::pass(
            'Endpoint allow-list: '.count($schemas).' entr'.(count($schemas) === 1 ? 'y' : 'ies').', all resolvable FormRequests.',
        );
    }
}
