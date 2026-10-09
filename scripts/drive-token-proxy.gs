/**
 * Google Drive token-exchange proxy for Battle Rhythm.
 *
 * WHY THIS EXISTS
 * Google's token endpoint advertises only client_secret_post and
 * client_secret_basic (verified against
 * https://accounts.google.com/.well-known/openid-configuration - there is no
 * "none"). A browser-only app therefore CANNOT exchange an authorization code
 * with PKCE alone: it gets 401 invalid_client "client_secret is missing". The
 * client secret must live somewhere the page cannot be read from, so it lives
 * here, in Script Properties, and never enters the repo, the bundle, or git.
 *
 * Deployed as a Web App (Execute as: Me, Who has access: Anyone). It accepts a
 * small JSON body and calls Google's token endpoint with the secret attached:
 *
 *   { "grant": "authorization_code", "code": "...", "code_verifier": "...",
 *     "redirect_uri": "https://stoptalkingishh.github.io/battle-rhythm/" }
 *   { "grant": "refresh_token", "refresh_token": "..." }
 *
 * It returns Google's own response body verbatim (tokens, or an error with
 * error/error_description), so the client sees the real reason, not a wrapper.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *  - It cannot serve as a generic token endpoint for other clients: CLIENT_ID
 *    comes from Script Properties, never from the request.
 *  - It does not store tokens. The refresh token lives in the user's browser
 *    (brdrive:refresh_token); this proxy only performs the exchange, because
 *    holding the secret is the only thing it is for.
 *  - The PKCE verifier is still required and still binds the code to the tab
 *    that started the sign-in, exactly as before.
 *
 * SETUP
 *  1. Project Settings -> Script properties:
 *       CLIENT_ID      the Web-application OAuth client id
 *       CLIENT_SECRET  its client secret (rotate it first if it was ever exposed)
 *       REDIRECT_URI   https://stoptalkingishh.github.io/battle-rhythm/
 *  2. Deploy -> New deployment -> Web app.
 *       Execute as: Me        Who has access: Anyone
 *  3. Copy the /exec URL and give it to the app as BR_DRIVE_TOKEN_PROXY.
 *
 * A GET returns a health line so a deploy can be checked without a browser.
 */

var TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function doGet() {
  return jsonOut({
    ok: true,
    service: 'battle-rhythm drive token proxy',
    version: 1,
    configured: Boolean(
      PropertiesService.getScriptProperties().getProperty('CLIENT_ID') &&
      PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET')
    )
  });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID');
  var clientSecret = props.getProperty('CLIENT_SECRET');
  var allowedRedirect = props.getProperty('REDIRECT_URI');

  if (!clientId || !clientSecret) {
    return jsonOut({ error: 'proxy_not_configured', error_description: 'CLIENT_ID / CLIENT_SECRET script properties are missing' });
  }

  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut({ error: 'invalid_request', error_description: 'body is not JSON' });
  }

  /* client_id and client_secret are ours, never the caller's. */
  var payload = { client_id: clientId, client_secret: clientSecret };

  if (req.grant === 'authorization_code') {
    if (!req.code || !req.code_verifier) {
      return jsonOut({ error: 'invalid_request', error_description: 'code and code_verifier are required' });
    }
    if (allowedRedirect && req.redirect_uri !== allowedRedirect) {
      return jsonOut({ error: 'invalid_request', error_description: 'redirect_uri is not allowed' });
    }
    payload.grant_type = 'authorization_code';
    payload.code = req.code;
    payload.code_verifier = req.code_verifier;
    if (req.redirect_uri) payload.redirect_uri = req.redirect_uri;
  } else if (req.grant === 'refresh_token') {
    if (!req.refresh_token) {
      return jsonOut({ error: 'invalid_request', error_description: 'refresh_token is required' });
    }
    payload.grant_type = 'refresh_token';
    payload.refresh_token = req.refresh_token;
  } else {
    return jsonOut({ error: 'unsupported_grant', error_description: 'grant must be authorization_code or refresh_token' });
  }

  try {
    var res = UrlFetchApp.fetch(TOKEN_ENDPOINT, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    /* Pass Google's answer through untouched: tokens on success, or its own
     * error/error_description (invalid_grant, invalid_client, ...) on failure. */
    return jsonOut(JSON.parse(res.getContentText()));
  } catch (err) {
    return jsonOut({ error: 'proxy_error', error_description: String((err && err.message) || err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
