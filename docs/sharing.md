# Sharing: position under the no-backend constraint

**Issue:** #11. **Date:** 2026-09-30. **Status:** deferred by decision.

The issue carries its own out clause: *"no backend. Anything here must work as
static files plus the existing Drive client, or be ruled out explicitly."* This
document is that ruling, criterion by criterion, so the decision is recorded
rather than left as an open feature request.

## What exists today

`js/data/plan-share.js` encodes a plan into a URL fragment and imports it back
with import sanitisation. Fragment-based, so the payload never reaches a server
in the URL sense — but it is still a link the recipient fetches, and it is a
snapshot, not a document.

## The three acceptance criteria

### 1. Regiments publishable and importable

**Achievable, not done.** Regiments are structured data in the same way sessions
are, so the existing encode/import path extends to them. The reason it is not
built is that it is a feature, not a correctness fix, and it is worth doing
alongside a decision on the other two criteria rather than before.

### 2. Write-protected sharing (read-only recipient)

**Achievable, and genuinely weak.** A read-only flag in the encoded payload
prevents the recipient from saving changes to *their* copy. It does not prevent
them from editing the fragment and re-sharing it. Without a server there is no
authority that can say which copy is current, so "write-protected" can only mean
"this link does not invite edits", not "this document cannot be changed". Naming
that honestly in the UI matters more than the flag.

### 3. "Two people edit the same shared plan"

**Already answered, by the architecture.** A shared link is a snapshot. Two
people who each import it hold two independent local copies; there is no shared
state, so there is no concurrent edit and therefore no conflict to resolve. The
honest answer is that link sharing does not support collaboration at all, and
that pretending otherwise via a merge UI would be worse than saying so.

This is also why #3 (last-write-wins across devices) is scoped to *one person's
Drive sync* and not to sharing. The two are different problems and #3's fix does
not extend to shared plans.

## Why deferred

Squad sharing in the sense the issue means — several people contributing to one
plan — requires an authority. Static files plus a Drive client cannot provide
one: Drive is per-user, so "the platoon plan" has no home that all members can
write to. The options all cross the no-backend line:

- a relay or sync service (a backend)
- per-member Drive folders with a merge protocol (no authority, so conflicts
  return, and #3's problem reappears at squad scale)
- share links plus a merge UI (criterion 3, answered above: it does not work)

## What would change this

Revisit if any of these becomes true: the project accepts a backend; Drive API
scope and a shared-folder model are proven to support multi-writer; or the user
base turns out to be teams rather than individuals. Until one of those, the
snapshot model is the correct design for the constraint, and the useful work is
making the snapshot good — criteria 1 and 2 — rather than simulating
collaboration.
