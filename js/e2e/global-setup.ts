import { build } from 'esbuild';

/**
 * Bundle the runtime once per run; every spec injects the bundle it needs
 * and drives it through a window global. Building here rather than
 * committing bundles keeps the specs honest against the CURRENT source.
 */
export default async function globalSetup(): Promise<void> {
    await Promise.all([
        build({
            entryPoints: ['js/src/index.ts'],
            bundle: true,
            format: 'iife',
            globalName: 'Laranail',
            outfile: 'js/e2e/.bundle/laranail.js',
            sourcemap: false,
            logLevel: 'silent',
        }),
        build({
            entryPoints: ['js/e2e/fixtures/react-entry.tsx'],
            bundle: true,
            format: 'iife',
            jsx: 'automatic',
            define: { 'process.env.NODE_ENV': '"development"' },
            outfile: 'js/e2e/.bundle/react-demo.js',
            sourcemap: false,
            logLevel: 'silent',
        }),
        build({
            entryPoints: ['js/e2e/fixtures/extras-entry.ts'],
            bundle: true,
            format: 'iife',
            globalName: 'LaranailExtras',
            outfile: 'js/e2e/.bundle/extras.js',
            sourcemap: false,
            logLevel: 'silent',
        }),
    ]);
}
