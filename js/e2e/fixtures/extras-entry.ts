/**
 * The bridge/debug bundle for the e2e suite: the optional modules a
 * server-rendered page would import, plus Alpine itself so the Alpine
 * bridge is proven against the real thing.
 */

export { default as Alpine } from 'alpinejs';
export { laranailAlpine } from '../../src/bridges/alpine.ts';
export { boot } from '../../src/bridges/autoboot.ts';
export { readSchemaIsland } from '../../src/bridges/island.ts';
export { attachDebug } from '../../src/debug.ts';
export { ClassMapRenderer } from '../../src/render/ClassMapRenderer.ts';
