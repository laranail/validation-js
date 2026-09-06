<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Events;

/**
 * One remote validation attempt, for abuse monitoring (§10.3). Carries
 * field NAMES and the outcome — never values: the event stream is exactly
 * the kind of sink a PAN or password would otherwise leak through.
 */
final readonly class RemoteValidationAttempted
{
    /**
     * @param list<string> $fields The Validate-Only field list (empty = full validation).
     * @param 'passed'|'failed'|'unauthorized'|'throttled' $outcome
     */
    public function __construct(
        public string $endpoint,
        public array $fields,
        public string $outcome,
    ) {}
}
