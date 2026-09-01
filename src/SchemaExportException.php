<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

use RuntimeException;
use Throwable;

/**
 * A schema could not be exported. Always a loud failure: the silent
 * alternative — an empty schema — disables client validation while
 * looking configured, which nobody notices until users do.
 */
final class SchemaExportException extends RuntimeException
{
    public function __construct(string $message, ?Throwable $previous = null)
    {
        parent::__construct($message, previous: $previous);
    }
}
