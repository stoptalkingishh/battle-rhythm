#!/usr/bin/env node
/**
 * Write js/config.js with the values supplied by the deploy job.
 *
 * The repo tracks js/config.js with both values empty, and
 * scripts/check-config.mjs fails CI if that ever stops being true. So the
 * values are injected into the staged copy at deploy time instead of being
 * committed: git never sees them, and the deployed bundle does.
 *
 * Both are public browser-side identifiers: the client id is not a secret, and
 * the token-proxy URL is only an address. What the injection buys is that they
 * stay out of git history, not secrecy.
 *
 * There is deliberately no API key any more. Drive v3 rejects API keys ("API
 * keys are not supported by this API"), so the key was only ever needed by the
 * removed gapi discovery bootstrap - and its referrer restriction is what broke
 * sign-in. The client secret is not here either: it lives in the Apps Script
 * token proxy, which is the one place a secret can be kept out of the page.
 *
 * Missing or blank values are written as empty strings. That is not an error:
 * the app runs fully offline in guest mode and simply hides the Drive button.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'js', 'config.js')

function readFlag(name) {
  const flag = `--${name}`
  const at = process.argv.indexOf(flag)
  if (at !== -1 && process.argv[at + 1]) return process.argv[at + 1]
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : ''
}

/* Escape for a JS double-quoted string literal. The values come from repo
 * secrets, so they are not attacker-controlled in the usual sense, but a
 * stray quote would produce a config.js that fails to parse and takes the whole
 * app down with a syntax error. Escaping keeps a bad value to "not configured"
 * rather than "site broken". */
function jsString(value) {
  return JSON.stringify(String(value || ''))
}

const clientId = readFlag('client-id')
const tokenProxy = readFlag('token-proxy')

const banner = `/* Google Drive backup configuration.
 *
 * GENERATED AT DEPLOY TIME by scripts/write-config.mjs - do not edit here.
 * The committed version of this file keeps both values empty so that
 * scripts/check-config.mjs can guarantee no credentials enter git history.
 *
 * Both values are public, browser-side identifiers. The OAuth client secret is
 * NOT here: Google's token endpoint accepts only client_secret_post or
 * client_secret_basic, so the code exchange is performed by the Apps Script
 * token proxy (scripts/drive-token-proxy.gs) named by BR_DRIVE_TOKEN_PROXY.
 *
 * The OAuth client must list this site's origin under Authorized JavaScript
 * origins, and this page's URL under Authorized redirect URIs, because sign-in
 * uses the Authorization Code flow with PKCE.
 */`

const body = `${banner}
window.BR_GOOGLE_CLIENT_ID = ${jsString(clientId)};
window.BR_DRIVE_TOKEN_PROXY = ${jsString(tokenProxy)};
`

fs.writeFileSync(target, body, 'utf8')

if (clientId && tokenProxy) {
  console.log('js/config.js: client id and token proxy injected; Drive backup enabled.')
} else {
  const missing = [!clientId && 'client id', !tokenProxy && 'token proxy'].filter(Boolean).join(' and ')
  console.log(
    `js/config.js: written with empty ${missing} (BR_GOOGLE_CLIENT_ID secret / ` +
      'BR_DRIVE_TOKEN_PROXY variable not set). The site will deploy and run in offline guest mode.'
  )
}