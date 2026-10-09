"use strict";
/* Google Drive backup configuration.
 *
 * These are NOT committed: the deploy job runs scripts/write-config.mjs with
 * the repository's BR_GOOGLE_CLIENT_ID secret and BR_DRIVE_TOKEN_PROXY
 * variable to generate this file in the published artifact, and
 * scripts/check-config.mjs fails CI if the tracked copy is ever populated.
 *
 * Both values are public, browser-side identifiers. There is deliberately NO
 * client secret here: Google's token endpoint accepts only client_secret_post
 * or client_secret_basic (no "none"), so a browser cannot exchange an
 * authorization code at all. If durable sign-in is enabled, the secret lives in
 * the Apps Script token proxy (scripts/drive-token-proxy.gs) and never enters
 * this repo, the bundle, or a visitor's devtools.
 * BR_DRIVE_TOKEN_PROXY is that proxy's /exec URL.
 *
 * BR_GOOGLE_CLIENT_ID is required for sign-in. BR_DRIVE_TOKEN_PROXY is
 * OPTIONAL: set it to make the login durable (refresh tokens, no hourly
 * re-auth). Leave it empty and sign-in still works through Google Identity
 * Services, but the access token lasts about an hour and is then re-minted from
 * the user's Google session.
 *
 * With the client id missing the app runs fully offline in guest mode and
 * offers no sign-in UI.
 *
 * The OAuth client must list this site's origin under Authorized JavaScript
 * origins AND this page's URL under Authorized redirect URIs, because sign-in
 * redirects back here with an authorization code.
 */
window.BR_GOOGLE_CLIENT_ID = "";
window.BR_DRIVE_TOKEN_PROXY = "";
