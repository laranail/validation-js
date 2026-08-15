<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use Simtabi\Laranail\ValidationJs\ValidationJsServiceProvider;

abstract class TestCase extends Orchestra
{
    /** @return list<class-string> */
    protected function getPackageProviders($app): array
    {
        return [ValidationJsServiceProvider::class];
    }
}
