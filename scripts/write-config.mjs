#!/usr/bin/env node
/**
 * Write js/config.js with the Google credentials supplied by the deploy job.
 *
 * The repo tracks js/config.js with both values empty, and
 * scripts/check-config.mjs fails CI if that ever stops being true. So the
 * credentials are injected into the staged copy at deploy time instead of
 * being committed: git never sees them, and the deployed bundle does.
 *
 * Both values are public browser-side identifiers, not secrets. A static
 * OAuth client has no server and therefore no client secret; the client id
 * and a referrer-restricted API key are readable by anyone who views the page
 * source, by design. What the injection buys is that they stay out of git
 * history, not secrecy.
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
const apiKey = readFlag('api-key')

const banner = `/* Google Drive backup configuration.
 *
 * GENERATED AT DEPLOY TIME by scripts/write-config.mjs - do not edit here.
 * The committed version of this file keeps both values empty so that
 * scripts/check-config.mjs can guarantee no credentials enter git history.
 *
 * Both values are public client-side identifiers, the same kind the openquiz
 * sibling bakes into its static build via NEXT_PUBLIC_GOOGLE_*. There is no
 * client secret: this is a browser-only app with no server, and PKCE replaces
 * the protection a secret would provide.
 *
 * The OAuth client must list this site's origin under Authorized JavaScript
 * origins, and this page's URL under Authorized redirect URIs, because sign-in
 * uses the Authorization Code flow with PKCE.
 */`

const body = `${banner}
window.BR_GOOGLE_CLIENT_ID = ${jsString(clientId)};
window.BR_GOOGLE_API_KEY = ${jsString(apiKey)};
`

fs.writeFileSync(target, body, 'utf8')

if (clientId && apiKey) {
  console.log('js/config.js: client id and API key injected; Drive backup enabled.')
} else {
  const missing = [!clientId && 'client id', !apiKey && 'API key'].filter(Boolean).join(' and ')
  console.log(
    `js/config.js: written with empty ${missing} (BR_GOOGLE_CLIENT_ID / BR_GOOGLE_API_KEY secrets not set). ` +
      'The site will deploy and run in offline guest mode.'
  )
}