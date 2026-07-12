'use strict';

/**
 * afterSign-vmp.js
 *
 * castLabs VMP (Verified Media Path) signing for the bundled Widevine CDM.
 *
 * Without a valid VMP signature the Widevine CDM only reaches a low robustness
 * level, and licensing servers for services like Spotify and Netflix refuse to
 * issue a license — playback fails, or dies a few seconds in.
 *
 * MUST run on `afterSign`, NOT `afterPack`.
 *
 *   electron-builder's order (see app-builder-lib/out/platformPackager.js):
 *     emitAfterPack()  ->  doSignAfterPack() [signtool]  ->  emitAfterSign()
 *
 * Authenticode signing rewrites the PE's certificate table, which invalidates
 * any VMP signature already applied to that binary. This hook originally ran on
 * afterPack on the assumption that CSC_IDENTITY_AUTO_DISCOVERY=false meant
 * electron-builder never invoked signtool — but it does anyway, so every build
 * VMP-signed Privoo.exe and then immediately clobbered that signature by
 * Authenticode-signing it. The result looked fine (build green, "[VMP] signing
 * complete" in the log) while still shipping an unverifiable media path, and
 * Spotify refused to play. Running on afterSign puts VMP last, so its signature
 * is the one that survives into the installer.
 *
 * Skips cleanly (with a warning) when EVS credentials aren't configured, so a
 * local `npm run dist` or a fork without secrets still produces a working
 * (non-DRM) installer instead of failing the build. When credentials ARE
 * present, a signing failure is treated as a real release error and fails loud.
 *
 * NOTE: electron-builder only fires afterSign when signing actually occurred; if
 * it ever stops signing, it logs `skipping "afterSign" hook as no signing
 * occurred` and this never runs — leaving an unsigned CDM. The release workflow
 * greps the build log for the completion line below to catch exactly that.
 *
 * NOTE: this file lives at the repo root (not build/) because build/ is
 * gitignored — keeping it here ensures it's actually committed and present in CI.
 *
 * Requires (in CI): Python 3.7+ and `pip install castlabs-evs`, plus the
 * EVS_ACCOUNT_NAME / EVS_PASSWD secrets created via `castlabs_evs.account signup`.
 */

const { execFileSync } = require('child_process');

exports.default = async function afterSign(context) {
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
