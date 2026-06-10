'use strict';

/**
 * afterPack-vmp.js
 *
 * castLabs VMP (Verified Media Path) signing for the bundled Widevine CDM.
 *
 * Runs after electron-builder packs the app directory, before it's zipped into
 * the installer. Without a valid VMP signature the Widevine CDM only reaches a
 * low robustness level, and licensing servers for services like Spotify and
 * Netflix will refuse to issue a license — so DRM playback silently fails.
 *
 * Windows note: VMP signing must run AFTER any Authenticode code-signing. We
 * don't Authenticode-sign (CSC_IDENTITY_AUTO_DISCOVERY=false), so signing in
 * afterPack is correct and reliable. If Authenticode signing is ever enabled,
 * move this to the `afterSign` hook instead.
 *
 * Skips cleanly (with a warning) when EVS credentials aren't configured, so a
 * local `npm run dist` or a fork without secrets still produces a working
 * (non-DRM) installer instead of failing the build. When credentials ARE
 * present, a signing failure is treated as a real release error and fails loud.
 *
 * NOTE: this file lives at the repo root (not build/) because build/ is
 * gitignored — keeping it here ensures it's actually committed and present in CI.
 *
 * Requires (in CI): Python 3.7+ and `pip install castlabs-evs`, plus the
 * EVS_ACCOUNT_NAME / EVS_PASSWD secrets created via `castlabs_evs.account signup`.
 */

const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  // Only Windows is shipped through the auto-updater today; sign that target.
  if (context.electronPlatformName !== 'win32') return;

  const hasCreds = process.env.EVS_ACCOUNT_NAME && process.env.EVS_PASSWD;
  if (!hasCreds) {
    console.warn('\n[VMP] EVS_ACCOUNT_NAME / EVS_PASSWD not set — skipping Widevine VMP signing.');
    console.warn('[VMP] The installer will build fine, but DRM services (Spotify/Netflix) may refuse to play.');
    console.warn('[VMP] Set up an EVS account (python -m castlabs_evs.account signup) and add the secrets to enable it.\n');
    return;
  }

  const pkgDir = context.appOutDir; // e.g. dist\win-unpacked
  const python = process.env.PYTHON || 'python';
  console.log(`[VMP] Signing Widevine package via EVS: ${pkgDir}`);
  try {
    execFileSync(python, ['-m', 'castlabs_evs.vmp', 'sign-pkg', pkgDir], {
      stdio: 'inherit',
      env: process.env,
    });
    console.log('[VMP] Widevine VMP signing complete.\n');
  } catch (err) {
    // Credentials were provided, so a failure here is a real release problem.
    throw new Error('[VMP] Widevine VMP signing failed: ' + (err && err.message ? err.message : err));
  }
};
