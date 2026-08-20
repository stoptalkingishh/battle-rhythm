"use strict";
/* Google Drive backup configuration.
 *
 * Fill these in to enable storing workouts in your own Google Drive:
 *   - BR_GOOGLE_CLIENT_ID: OAuth 2.0 Client ID (Web application) from
 *     https://console.cloud.google.com/apis/credentials
 *   - BR_GOOGLE_API_KEY:  API key from the same console (Google Drive API enabled)
 *
 * Both values are public client-side identifiers (the same ones openquiz bakes
 * into its static build). With either missing, the app runs fully offline in
 * guest mode and everything stays in localStorage — no sign-in UI is offered.
 *
 * The OAuth client must list this site's origin (e.g.
 * https://stoptalkingishh.github.io) under Authorized JavaScript origins.
 */
window.BR_GOOGLE_CLIENT_ID = "";
window.BR_GOOGLE_API_KEY = "";