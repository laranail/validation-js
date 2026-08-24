import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

/**
 * The server-rendered bridges: autoboot's declarative wiring + swap
 * lifecycle, the Alpine component/magic, and the debug channel — the
 * pieces a Blade/HTMX/Turbo page uses with no hand-written JS.
 */

const SCHEMA = schemaFor(
    { email: { client: [{ rule: 'required' }, { rule: 'email' }] } },
    { 'email.email': 'The email field must be a valid email address.' },
);

const ISLAND = `<script type="application/json" data-laranail-schema="signup">${JSON.stringify(
    SCHEMA,
)}</script>`;

test('autoboot wires a marked form from its island, declaratively', async ({ page }) => {
    await bootPage(
        page,
        `${ISLAND}<form data-laranail="signup"><input name="email" id="email"></form>`,
        ['extras.js'],
    );

    await page.evaluate(() => {
        const x = (
            window as never as {
                LaranailExtras: { boot: Function; ClassMapRenderer: new (p?: unknown) => unknown };
            }
        ).LaranailExtras;
        (window as never as { handle: unknown }).handle = x.boot({
            renderer: new x.ClassMapRenderer({}),
        });
    });

    await expect(page.locator('form')).toHaveAttribute('novalidate', '');

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();
    await expect(page.locator('[data-laranail-message="email"]')).toContainText('valid email');
});

test('a form without an island keeps native constraints — never a broken page', async ({
    page,
}) => {
    await bootPage(page, '<form data-laranail="missing"><input name="email" required></form>', [
        'extras.js',
    ]);

    await page.evaluate(() => {
        (window as never as { LaranailExtras: { boot: Function } }).LaranailExtras.boot();
    });

    await expect(page.locator('form')).not.toHaveAttribute('novalidate');
});

test('a swap event re-scans the new form and prunes the removed one', async ({ page }) => {
    await bootPage(
        page,
        `${ISLAND}<div id="zone"><form data-laranail="signup" id="a"><input name="email"></form></div>`,
        ['extras.js'],
    );

    await page.evaluate(() => {
        const x = (
            window as never as {
                LaranailExtras: { boot: Function; ClassMapRenderer: new (p?: unknown) => unknown };
            }
        ).LaranailExtras;
        (window as never as { handle: { validators(): unknown[] } }).handle = x.boot({
            renderer: new x.ClassMapRenderer({}),
        }) as { validators(): unknown[] };
    });

    const count = () =>
        page.evaluate(
            () =>
                (window as never as { handle: { validators(): unknown[] } }).handle.validators()
                    .length,
        );
    expect(await count()).toBe(1);

    // An HTMX-style partial swap: the old form leaves, a new one arrives.
    await page.evaluate(() => {
        const zone = document.querySelector('#zone') as HTMLElement;
        zone.innerHTML =
            '<form data-laranail="signup" id="b"><input name="email" id="email"></form>';
        document.dispatchEvent(
            new CustomEvent('htmx:afterSwap', { detail: { target: zone }, bubbles: true }),
        );
    });

    expect(await count()).toBe(1);

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();
    await expect(page.locator('[data-laranail-message="email"]')).toBeVisible();
});

test('the Alpine component owns its validator and $laranail reaches it', async ({ page }) => {
    await bootPage(
        page,
        `${ISLAND}
        <form x-data="laranailForm('signup')">
            <input name="email" id="email">
            <button type="button" id="probe" @click="window.probed = $laranail !== null"></button>
        </form>`,
        ['extras.js'],
    );

    await page.evaluate(() => {
        const x = (
            window as never as {
                LaranailExtras: {
                    Alpine: { plugin: Function; start: Function };
                    laranailAlpine: Function;
                };
            }
        ).LaranailExtras;
        x.Alpine.plugin(x.laranailAlpine());
        x.Alpine.start();
    });

    await expect(page.locator('form')).toHaveAttribute('novalidate', '');

    await page.locator('#probe').click();
    expect(await page.evaluate(() => (window as never as { probed: boolean }).probed)).toBe(true);

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
});

test('attachDebug narrates verdicts to the console and detaches cleanly', async ({ page }) => {
    await bootPage(
        page,
        `${ISLAND}<form data-laranail="signup"><input name="email" id="email"></form>`,
        ['extras.js'],
    );

    const lines: string[] = [];
    page.on('console', (message) => lines.push(message.text()));

    await page.evaluate(() => {
        const x = (
            window as never as {
                LaranailExtras: { boot: Function; attachDebug: (v: unknown) => () => void };
            }
        ).LaranailExtras;
        const handle = x.boot() as { validators(): unknown[] };
        (window as never as { detach: () => void }).detach = x.attachDebug(handle.validators()[0]);
    });

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();

    await expect.poll(() => lines.some((line) => line.includes('email → invalid'))).toBe(true);

    await page.evaluate(() => (window as never as { detach: () => void }).detach());
    const before = lines.length;
    await email.fill('a@b.co');
    await email.blur();
    await page.waitForTimeout(150);

    expect(lines.slice(before).some((line) => line.includes('email →'))).toBe(false);
});
