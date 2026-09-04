<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Commands;

use Symfony\Component\Process\Process;
use Simtabi\Laranail\Console\Tools\Commands\Command;
use Simtabi\Laranail\ValidationJs\Support\EngineIntrospection;
use Simtabi\Laranail\Console\Tools\Commands\Concerns\SupportsNamespacedNames;

/**
 * The CI parity-currency job, made local (§5.8): regenerate the
 * differential fixtures from Laravel's own verdicts and report whether
 * the tracked file moved. A dependency bump in the sister repo shows up
 * HERE, before a red CI wave does — the exact failure the Phase-5 release
 * produced.
 */
final class ParityCommand extends Command
{
    use SupportsNamespacedNames;

    protected $signature = 'laranail::validation-js.parity';

    protected $description = 'Regenerate the differential parity fixtures and report whether they changed.';

    public function handle(): int
    {
        $root = EngineIntrospection::packageRoot();

        if (! is_file($root . '/vendor/bin/pest') || ! is_dir($root . '/.git')) {
            $this->error('The parity command runs inside the package checkout (it needs pest and git).');

            return self::FAILURE;
        }

        $this->line('Regenerating fixtures from Laravel’s verdicts…');
        $generate = new Process(
            [$root . '/vendor/bin/pest', 'tests/ParityFixtureTest.php'],
            $root,
            timeout: 600,
        );
        $generate->run();

        if (! $generate->isSuccessful()) {
            $this->error('Fixture generation failed:');
            $this->line($generate->getOutput() . $generate->getErrorOutput());

            return self::FAILURE;
        }

        $diff = new Process(
            ['git', 'diff', '--stat', '--exit-code', 'js/tests/fixtures/'],
            $root,
            timeout: 60,
        );
        $diff->run();

        if ($diff->isSuccessful()) {
            $this->info('Fixtures are current — nothing changed.');

            return self::SUCCESS;
        }

        $this->warn('Fixtures moved — review and commit the regeneration:');
        $this->line($diff->getOutput());

        return self::FAILURE;
    }
}
