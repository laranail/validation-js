<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Tests;

use Simtabi\Laranail\ValidationJs\Providers\ValidationJsServiceProvider;
use Simtabi\Laranail\Package\Tools\Testing\IsolatedTestCase;

abstract class TestCase extends IsolatedTestCase
{
    /** @return list<class-string> */
    protected function getPackageProviders($app): array
    {
        return [ValidationJsServiceProvider::class];
    }
}
