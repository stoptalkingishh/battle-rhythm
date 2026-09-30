# Sync merge and conflict policy

Applies to `js/sync-core.js` (all decision logic, pure and unit-tested),
`js/cloud.js` (Drive I/O, base snapshots, the conflict stash) and
`js/app.js` (the Settings panel that asks the user to choose).

Addresses [#3](https://github.com/stoptalkingishh/battle-rhythm/issues/3).

## The bug this replaces

The previous merge rule was, in full:

```js
function mergeById(remote, local) { /* Drive wins on id collision */ }
```

A merge rule can only distinguish a genuine conflict from a one-sided change if
it knows the **common ancestor** — the state both devices last agreed on. Without
it, "Drive wins on ID collision" is the only available rule, and a change made on
device B silently destroys a change made earlier on device A. That is the silent
data loss the issue describes.

## Why a base snapshot exists

Every device now keeps `brsync_base_<file>` in localStorage: the exact value it
last saw Drive confirm, written only after Drive returns `ok` plus a
`modifiedTime`. That is the ancestor. It is device-local and is never itself
synced — it is a claim about what Drive holds, not user data.

On the first sync after this change there is no base yet, and on a device that
has never synced there never will be. That case is handled explicitly rather than
guessed at (see *No ancestor* below).

## Merge algorithm

Per record, with `base` / `local` / `remote`:

| Condition | Result |
|---|---|
| `local == remote` | one value, not a conflict — the devices agree |
| `local == base` | only the other device changed → take theirs |
| `remote == base` | only this device changed → keep ours |
| both differ from base, on **different** fields | field-level union, not a conflict |
| both differ from base, on the **same** field | **conflict** |
| record added on one side only | take it, not a conflict |
| both added the same id with identical content | agreement, not a conflict |
| both added the same id, different content | **conflict** (`created-both`) |

Comparison is via `stable()` — a key-order-independent serialization — so
re-serializing a record never reads as an edit.

The **record** is the unit of conflict, not the field: one record edited on both
devices yields one conflict listing every contested field, not N conflicts.

### Field-level unions are deliberate

Merging two edits that touch disjoint fields loses nothing, so treating them as a
conflict would train the user to click through the panel without reading it.
Arrays are compared whole (an array edit on both sides has no safe union).

## Policy per record type

The issue asked for a decision per type. The honest answer is that the unit of
conflict differs, not the rule — the rule is the same three-way merge everywhere,
because "never lose an edit, ask the user" does not vary by type.

| Collection | File | Conflict unit |
|---|---|---|
| `br_sessions` | `sessions.json` | one session (`id`) |
| `br_regiments` | `regiments.json` | one regiment (`id`) |
| `br_tracker` (log entry) | `tracker.json` | one logged session, keyed `date` → `sessions[sessionId]` |
| `br_bodyweight` | `bodyweight.json` | one weigh-in (`id`) |
| `br_aft_results` | `aft-results.json` | one AFT result (`id`) |
| `br_custom_exercises` | `custom-exercises.json` | one custom exercise (`id`) |
| `br_groups`, `br_routines`, `br_week`, `br_exweights` | `*.json` | one row (`id`) |

The tracker is the one shape that is not a flat array of rows. Two logged
sessions with the same `sessionId` on *different* dates are two independent
records and merge cleanly; the same `sessionId` on the same date is a genuine
collision. The date is recorded on the conflict entry (`path`) so the panel can
name where it is.

## How a conflict is resolved: keep both, then ask

Never by timestamp, and never by silently picking a side. When a conflict is
detected:

1. This device's version stays at the original id, so the edit the user just made
   is where they expect to find it.
2. The other device's version is **also written**, under a derived id
   `"<recordId>~conflict-<digest>"`, tagged
   `_conflict: { from, source: "remote", detectedAt }`.
3. A conflict entry is recorded in the device-local stash (`brsync_conflicts`),
   holding `base`, `local` and `remote` so the panel can show all three.
4. Both versions sync to Drive, so every device ends up holding both.

The fork id is derived from the *other device's content*, not from a clock or a
counter. Two devices that independently detect the same collision mint the same
fork id, so the sibling does not multiply on every sync, and a fork that has been
synced is an ordinary agreed record on the next pass — not a fresh conflict.

The user resolves each conflict in **Settings → Sync conflicts**, with three
choices: keep this device's, keep the other device's, or keep both. Nothing is
decided automatically.

### Reachability in guest mode

The panel renders on every open of Settings, whether or not Drive is configured.
`BRCloud` reads the stash from localStorage, so a conflict raised on this device
stays visible and resolvable after signing out — signing out deliberately does not
drop unresolved conflicts, since that would re-hide the other device's edit.

Guest mode with no Drive account has nothing to conflict *with*, and no network
or credential is required for any of this to work.

## Known limits

Documented rather than left as a silent gap:

- **A record deleted on one device and edited on the other** is detected and
  surfaced, but there is no second *version* to keep: an absence is not content.
  The edit wins and the user is asked (`delete-local-vs-edit-remote` /
  `edit-local-vs-delete-remote`, `forkId: null`). In the delete-here case this
  resurrects a record the user deleted, deliberately — destroying the other
  device's edit is the failure mode this issue is about.
- **First sync, or any device with no base snapshot**, has no ancestor, so there
  is no evidence that a shared id is a collision rather than a one-sided edit.
  That path uses the old Drive-wins union and reports `ancestorKnown: false`. It
  does **not** flag conflicts, because flagging every shared id would make the
  panel useless. Conflicts are detected from the first sync that has a base.
- **`_conflict` tagged records are real records.** A resolved-away fork is
  removed, but a `both` choice leaves two entries that look like ordinary ones.
  The tag is on the record so the app can tell them apart; nothing currently
  surfaces it in the main views.
- **Deliberate deletion can resurrect.** Because a delete on one device against
  an edit on the other keeps the edit, a user who deletes a session on device A
  and syncs device B (which had edited it) sees the session back, with the
  conflict panel explaining why. This is the conservative choice, not an oversight.
- **Wall-clock timestamps are never used to decide anything.** Two devices with
  skewed clocks cannot produce a wrong resolution here, because the decision is
  made from content equality against the base, not from "which is newer".

## Tests

`tests/sync-conflicts.test.js` (34 tests) covers the detection, and pairs every
positive case with a counter-case asserting the same shape does **not** conflict
when only one device edited, when the edits are disjoint, or when both devices
made the same change. `tests/sync-core.test.js` still covers the pre-existing
two-way reconcile and outbox behaviour.
