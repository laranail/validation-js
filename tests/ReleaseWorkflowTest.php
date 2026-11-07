<?php

declare(strict_types=1);

use Symfony\Component\Yaml\Yaml;

/*
 * The npm package must never be published from a tag push.
 *
 * v0.1.0 is a moving tag and a published registry version is immutable, so an automatic publish fires once and
 * then skips in silence for ever, freezing the registry while the tag moves on. It already happened: GitHub
 * Packages holds @laranail/validation-js@0.1.0 from an early tag push, and every run since reported success.
 * docs/release.md had described the hazard exactly; the workflow contradicted it and the workflow won.
 *
 * These assertions read the parsed workflow rather than grepping it, so they survive a reformat, and they check
 * the file and the job exist before asserting anything about them.
 */

/** @return array<array-key, mixed> */
function releaseWorkflowParsed(): array
{
    $path = dirname(__DIR__) . '/.github/workflows/release.yml';

    expect($path)->toBeFile();

    $parsed = Yaml::parse(releaseWorkflowRaw());

    expect($parsed)->toBeArray();

    return is_array($parsed) ? $parsed : [];
}

function releaseWorkflowRaw(): string
{
    $raw = file_get_contents(dirname(__DIR__) . '/.github/workflows/release.yml');

    expect($raw)->toBeString();

    return is_string($raw) ? $raw : '';
}

/**
 * Walk a path of keys, yielding [] rather than null so a renamed job fails on the assertion that follows
 * instead of on a type error here.
 *
 * @param array<array-key, mixed> $data
 *
 * @return array<array-key, mixed>
 */
function workflowSection(array $data, string ...$keys): array
{
    foreach ($keys as $key) {
        $next = $data[$key] ?? null;
        $data = is_array($next) ? $next : [];
    }

    return $data;
}

function workflowString(mixed $value): string
{
    return is_string($value) ? $value : '';
}

/**
 * `on:` is a YAML 1.1 boolean, so some parsers key it as true rather than 'on'.
 *
 * @return array<array-key, mixed>
 */
function workflowTriggers(): array
{
    $parsed = releaseWorkflowParsed();
    $on = $parsed['on'] ?? $parsed[true] ?? null;

    return is_array($on) ? $on : [];
}

it('publishes the npm package only from a hand-started run, never from a tag push', function (): void {
    $job = workflowSection(releaseWorkflowParsed(), 'jobs', 'npm-publish');

    expect($job)->not->toBeEmpty('the npm-publish job must exist');

    // A tag push would publish once and skip for ever after, so the job must require a hand-started run;
    // NPM_PUBLISH_ENABLED stays as the second switch. toContain() is variadic, so neither takes a message.
    expect(workflowString($job['if'] ?? null))
        ->not->toBeEmpty('the npm job must stay gated')
        ->toContain("github.event_name == 'workflow_dispatch'")
        ->toContain('vars.NPM_PUBLISH_ENABLED');

    // It no longer chains to the release job, which does not run on a dispatch at all.
    expect($job)->not->toHaveKey('needs')
        ->and(workflowTriggers())->toHaveKey('workflow_dispatch');
});

it('still creates the GitHub release from the tag, which is the half that must stay automatic', function (): void {
    $release = workflowSection(releaseWorkflowParsed(), 'jobs', 'release');
    $push = workflowSection(workflowTriggers(), 'push');

    expect($release)->not->toBeEmpty('the release job must exist')
        ->and(workflowString($release['if'] ?? null))->toContain("github.event_name == 'push'")
        ->and($push)->toHaveKey('tags')
        ->and($push['tags'])->not->toBeEmpty();
});

it('does not require the manifest version to equal the tag', function (): void {
    // This check is what froze the package: the tag is permanently v0.1.0, so tying the manifest to it pinned
    // the npm version to a release that is already published and cannot be replaced.
    expect(releaseWorkflowRaw())
        ->not->toContain('Verify manifest matches tag')
        ->not->toContain('test "v$MANIFEST" = "$TAG"');
});

it('warns when a run publishes nothing, so a skip cannot read as a release', function (): void {
    $steps = workflowSection(releaseWorkflowParsed(), 'jobs', 'npm-publish', 'steps');
    $probe = [];

    foreach ($steps as $step) {
        $step = is_array($step) ? $step : [];

        if (($step['id'] ?? null) === 'published') {
            $probe = $step;
        }
    }

    expect($probe)->not->toBeEmpty('the already-published probe must still exist')
        ->and(workflowString($probe['run'] ?? null))->toContain('::warning::');
});

it('names a version that is not the frozen 0.1.0', function (): void {
    $manifest = json_decode(workflowString(file_get_contents(dirname(__DIR__) . '/package.json')), true);
    $manifest = is_array($manifest) ? $manifest : [];

    expect(workflowString($manifest['version'] ?? null))
        ->not->toBeEmpty()
        // 0.1.0 is on GitHub Packages and immutable, so a manifest still on it can publish nothing.
        ->not->toBe('0.1.0');
});
