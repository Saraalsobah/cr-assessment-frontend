## 0. Orientation

This is the reviewer UI for Change Requests (CRs): proposed changes to an organisation's purchase agreement that need approval. We have two screens. The list screen loads the current user's CRs (only those in their organisation) and shows a loading, loaded, empty, or error state, with a status filter to narrow the table. The detail screen loads one CR and shows what it changes (a line-item diff with totals and delta), its history, and Approve/Reject actions that are only available when the CR is pending and the user's policies allow it. Each screen keeps its data in a single `ViewState` object (`idle | loading | loaded | empty | error`, plus `data` and `error`) that the template switches on. The detail screen also adds action state (`submitting`, `actionError`, and the reject-reason form control).

## 1. What I changed
<!-- Grouped by task: bugs fixed and features implemented (component + template). -->

-

## 2. Component & state model
<!-- The screens, the view-state each component exposes, and how data flows from the mock API into the
template. -->

-

## 3. Invariants I keep
<!-- Which properties the UI guarantees, and where in the component/template each is enforced. -->

| Invariant | How / where |
|---|---|

## 4. Testing strategy
<!-- What you tested (component/DOM vs pure) and why; what you deliberately skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the requirements left room for interpretation, the calls you made and why. -->

-

## 6. Where I used AI
-

## 7. What I'd improve with more time
-
