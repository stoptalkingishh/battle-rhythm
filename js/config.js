"use strict";
/* Google Drive backup configuration.
 *
 * Both values are public client-side identifiers (the same kind openquiz bakes
 * into its static build). They are NOT committed: set the repository secrets
 * BR_GOOGLE_CLIENT_ID and BR_GOOGLE_API_KEY, and the deploy job runs
 * scripts/write-config.mjs to generate this file in the published artifact.
 * That keeps credentials out of git history while
 * scripts/check-config.mjs enforces that this tracked copy stays empty.
 *
 * With either missing, the app runs fully offline in guest mode and everything
 * stays in localStorage — no sign-in UI is offered. There is no client secret:
 * this is a browser-only app with no server, and sign-in uses the
 * Authorization Code flow with PKCE instead.
 *
 * The OAuth client must list this site's origin under Authorized JavaScript
 * origins AND this page's URL under Authorized redirect URIs, because sign-in
 * redirects back here with an authorization code.
 */
window.BR_GOOGLE_CLIENT_ID = "";
window.BR_GOOGLE_API_KEY = "";