# Implementation Notes

## 0. Orientation

This is the reviewer UI for Change Requests (CRs): proposed changes to an organisation's purchase agreement that need approval. We have two screens. The list screen loads the current user's CRs (only those in their organisation) and shows a loading, loaded, empty, or error state, with a status filter to narrow the table. The detail screen loads one CR and shows what it changes (a line-item diff with totals and delta), its history, and Approve/Reject actions that are only available when the CR is pending and the user's policies allow it. Each screen keeps its data in a single `ViewState` object (`idle | loading | loaded | empty | error`, plus `data` and `error`) that the template switches on. The detail screen also adds action state (`submitting`, `actionError`, and the reject-reason form control).

## 1. What I changed

**Task 1: root-cause fixes**
- **Diff bug** (`diff.util.ts`): `computeDiff` only compared `unitPrice`, so a quantity-only or description-only change was reported as `unchanged`. It now compares quantity, unit price and description.
- **Permission bug** (detail component): `canApprove` only checked that the CR was `PENDING_APPROVAL`, so a read-only viewer got an enabled Approve button. It now also requires an approve policy (`canApprovePolicy(user)`). `canReject` reuses `canApprove`, so both actions share one rule.

**Task 2: list**
- Component: `visibleRows` filters by the selected status (`ALL` shows everything). Added `fmt()` so the delta column is formatted as money (e.g. `USD 500.00`).
- Template: a "No change requests with status X" message when the filter matches nothing, kept separate from the `empty` state ("your org has no CRs" vs "nothing has this status"). The table only renders when there are rows to show.

**Task 3: detail**
- Component: `timeline` sorts a **copy** of the audit entries oldest-first (`.sort()` mutates in place, and I don't want to change the API data).
- Component: the reject reason uses `Validators.required` and `Validators.pattern(/\S/)`, so it can't be empty or only spaces. `reject()` re-checks validity, marks the field as touched so the message shows, and sends the reason trimmed.
- Component: `approve()` / `reject()` call the API and show the updated CR it returns. On failure, the page keeps the last loaded CR and shows `actionError`. See invariants below.

**Task 4: read-only + UX states**
- Component + template: `noActionReason` explains why no actions are available ("read-only access" or "this change request is APPROVED"), instead of only showing a disabled button.
- Template: buttons show "Approving…" / "Rejecting…" while a request is in flight.
- Template: the timeline reads "CREATE by alice · 2026-03-02 09:00 UTC" (the fields used to run together, and the date was a raw ISO string).

**Extra fixes I found while testing in the browser**
- The detail page didn't change when another CR was clicked in the list, because it only loaded in `ngOnInit`, which runs once. Added `ngOnChanges` to reload when `id` changes.
- After Approve/Reject, the list still showed the old status until the page was reloaded (stale UI). The detail component now emits a `changed` output, and the app shell calls `list.load()` when it fires.

## 2. Component & state model

| Component | State | Derived (getters) |
|---|---|---|
| `CrListComponent` | `state: ViewState<CrSummary[]>`, `statusFilter` | `visibleRows` |
| `CrDetailComponent` | `state: ViewState<CrDetail>`, `submitting`, `actionError`, `rejectControl` | `diff`, `timeline`, `canApprove`, `canReject`, `noActionReason` |

- Data flow: the mock API returns a Promise, the component stores the result in `state`, and the getters compute everything the template shows from it. Since there's one source of truth per screen, the rest can't get out of sync.
- Templates only read state and call methods. The logic lives in the component, which makes it testable.
- Components talk through inputs and outputs: the list emits `select` (which CR was clicked), the detail takes `id` as an input and emits `changed` after an action.

## 3. Invariants I keep

| Invariant | How / where |
|---|---|
| Actions only when the CR is pending **and** the user has an approve policy | `canApprove` / `canReject`; template `[disabled]` and `*ngIf`; re-checked at the start of `approve()` / `reject()` |
| A read-only user never has an enabled action | Approve disabled, reject form not rendered, `noActionReason` message shown |
| No double submit | `submitting` is set to `true` before the `await`; both buttons are disabled while it's true; the methods return early if it's already true (two layers: the button and the code guard) |
| A failed action doesn't break the page | `state` is only replaced on success; on failure the last good CR stays on screen with `actionError`; `finally` re-enables the buttons |
| Reject never goes out without a real reason | `required` + `pattern(/\S/)` validators; button disabled while invalid; `reject()` re-checks |
| Timeline is chronological without mutating API data | sort on `[...audit]` |
| List and detail agree after an action | `changed` output → `list.load()` |

## 4. Testing strategy

- **Component/DOM tests (TestBed + Jest)** that check what the user sees: rendered rows, messages, button `disabled` state and text, status, and timeline order.
- **List:** filter narrows the rendered rows; no-matches message replaces the table.
- **Detail:** timeline oldest-first; viewer gets the read-only message and no reject form; Approve success; Approve failure (via the mock's `failNext`) keeps the CR pending, shows the error and re-enables the button; Reject blocked for an empty or spaces-only reason; slow Approve (via `latencyMs`) shows "Approving…", stays disabled, and sends exactly **one** request even if `approve()` is called again (checked with `jest.spyOn`).
- The originally failing diff and permission tests now pass. 15 tests in total (7 provided + 8 added).
- Reliable and repeatable: the tests control the mock's `latencyMs` / `failNext` and use short fixed waits, so they don't depend on real network timing. Timestamps are shown in UTC so results don't depend on the machine's time zone.
- **Not covered (time):**
  - List error/retry: a failed load shows the error, and Retry brings the rows back.
  - Reject failure: the error shows, the CR stays pending, and the typed reason is kept for a retry.
  - Switching CR during a slow request: a late response for CR-1 shouldn't overwrite CR-3 if the user moved on (this needs a code guard too, see section 7).

## 5. Assumptions & judgment calls

- **Permission scope:** policies look like `cr_{action}_{scope}`. For approving there are three:
  - `cr_a_o`: approve **any** CR in the user's organisation
  - `cr_a_w`: approve CRs in the user's **workspace** (a team inside the org)
  - `cr_a_u`: approve only CRs the user **created themselves**

  My `canApprove` accepts **any** of the three, using the provided `canApprovePolicy` helper. That's correct for the provided users, who all have `cr_a_o`. But it's looser than the rules: someone with only `cr_a_u` could approve other people's CRs. A stricter version would allow `cr_a_u` only when the CR's `CREATE` audit entry is by that user, and deny `cr_a_w`, because the CR data has no workspace field to check. Either way, the backend must enforce permissions. The UI only avoids offering actions that aren't allowed.
- **Who can reject:** the policies only define read, approve and apply (no "reject" action). I decided that anyone who can approve can also reject, since an approver's job is to say yes or no. So `canReject` simply returns `canApprove`.
- **Approve stays visible but disabled** for users who can't approve, because the provided test expects the button to exist and be disabled. The reject form is hidden completely, because a read-only user has nothing to type.
- **A description change counts as a change**, since the reviewer can see it (e.g. CR-2's supplier change).
- **Failed actions:** a network error doesn't prove nothing happened. The server may have saved the change before the connection failed (the mock API does exactly this: it saves first, then throws the error). So on failure the page keeps showing the last loaded CR with an error message, instead of guessing. Reloading the CR shows its real status.
- Timestamps are displayed in UTC.

## 6. Where I used AI

- I used Claude as a step-by-step tutor. It explained the codebase and the Angular concepts I didn't know yet (I mainly work in React), reviewed each change I made, pointed out mistakes, and suggested the structure for the tests (pseudo code and skeletons with blanks that I filled in).
- I typed every code change myself in VS Code, ran the tests and the app, and made each commit and push myself.
- I found the two extra bugs (the detail page not reloading on a new selection, and the stale list after an action) myself while testing in the browser. Claude explained the cause and the Angular pattern for the fix, and I understood them first then implemented them.
- These notes were drafted from my own points and polished with Claude's help.

## 7. What I'd improve with more time

- **Scope-aware permissions:** right now any approve policy is accepted. I'd make it stricter: `cr_a_o` can approve any CR in the org, `cr_a_u` only CRs the user created, and `cr_a_w` is denied explicitly (see Assumptions).

- **Stale-response guard:** if a slow load or action for CR-1 finishes after the user has already opened CR-2, ignore the old result (e.g. a request counter, or RxJS `switchMap`).
- **Safer retries:** after a failed Approve, the server might have saved it anyway, so clicking again could approve twice. I'd reload the CR before allowing a retry, or send a unique ID with each request so the server can ignore duplicates.
- **More tests:** list error/retry state, Reject failure, and switching CRs during a slow request.
- **Small UX polish:** highlight the selected row in the list, show a signed delta (`+USD 500.00`), confirm before approving, and improve the layout and styling (e.g. spacing in the list table).