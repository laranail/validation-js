<?php

declare(strict_types=1);

use Simtabi\Laranail\Package\Tools\Testing\AssertsNoLiteralCredentials;

/*
 * Secret scanning cannot tell a test password from a leaked one, and reports both. Tests take
 * their credentials from TestCredentials at run time; this fails on any literal left behind, and
 * on any generated credential whose purpose is not a single plain word.
 *
 * Measured 2026-10-19: 13 PHP files under tests/.
 */
uses(AssertsNoLiteralCredentials::class);

it('keeps literal credentials out of the tests', function (): void {
    $this->assertNoLiteralCredentialsIn([dirname(__DIR__)], minFiles: 12);
    expect(true)->toBeTrue();
});

it('names every generated credential with a single word', function (): void {
    $this->assertCredentialPurposesAreWordsIn([dirname(__DIR__)], minFiles: 12);
    expect(true)->toBeTrue();
});
