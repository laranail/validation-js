import { build } from 'esbuild';

/**
 * Bundle the runtime once per run; every spec injects the same IIFE and
 * drives it through `window.Laranail`. Building here rather than
 * committing a bundle keeps the specs honest against the CURRENT source.
 */
export default async function globalSetup(): Promise<void> {
    await build({
        entryPoints: ['js/src/index.ts'],
        bundle: true,
        format: 'iife',
        globalName: 'Laranail',
        outfile: 'js/e2e/.bundle/laranail.js',
        sourcemap: false,
        logLevel: 'silent',
    });
}
