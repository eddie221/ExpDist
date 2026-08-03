# ExpDist — Code Reference

---

## `src/firebase.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `app` | `FirebaseApp` | Initialized Firebase application instance |
| `db` | `Firestore` | Firestore database handle used by all services |
| `auth` | `Auth` | Firebase Auth handle used by auth service |

---

## `src/types/index.ts`

### Type Definitions

| Name | Kind | Key Fields |
|------|------|------------|
| `User` | interface | `uid`, `displayName`, `email`, `photoURL`, `color?` |
| `GroupMember` | interface | `uid`, `displayName`, `email?` |
| `Group` | interface | `id`, `name`, `createdBy`, `members[]`, `memberUids[]`, `createdAt` |
| `Expense` | interface | `id`, `groupId`, `description`, `amount` (cents), `paidBy`, `splitBetween`, `createdAt` |
| `LogEntry` | interface | `id`, `groupId`, `action`, `expenseDescription`, `amountCents`, `actorUid`, `actorName`, `createdAt` |
| `Balance` | interface | `uid`, `displayName`, `net` (cents; positive = owed, negative = owes) |
| `Settlement` | interface | `from`, `fromName`, `to`, `toName`, `amount` |
| `Route` | union type | `login` \| `groups` \| `group{id}` \| `profile` \| `not-found` |

---

## `src/store/app.store.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `store` | store object | Singleton observable app-state store created by `createStore()` |

### Functions

#### `createStore()`
- **Inputs:** none
- **Outputs:** `{ getState, setState, subscribe }`
- **Description:** Creates and returns the observable store.
- **Workflow:** Initialises `state` with default values (`user:null`, `groups:[]`, etc.) and a `Set<Listener>`. Returns three methods that close over these values.

#### `store.getState()`
- **Inputs:** none
- **Outputs:** `AppState`
- **Description:** Returns the current state snapshot.

#### `store.setState(partial)`
- **Inputs:** `Partial<AppState>`
- **Outputs:** `void`
- **Description:** Merges partial update into state via spread, then calls `notify()` to invoke all subscribers.

#### `store.subscribe(fn)`
- **Inputs:** `Listener` (`() => void`)
- **Outputs:** `() => void` (unsubscribe)
- **Description:** Adds listener to the set; returned function removes it.

---

## `src/router.ts`

### Functions

#### `parseHash(hash)` *(private)*
- **Inputs:** `string` (raw `window.location.hash`)
- **Outputs:** `Route`
- **Description:** Maps hash strings (`#/groups`, `#/groups/:id`, etc.) to typed `Route` discriminated union values.
- **Workflow:** Strips leading `#`, matches against fixed strings and a regex for group IDs, returns `not-found` for unrecognized paths.

#### `navigate(route)`
- **Inputs:** `Route`
- **Outputs:** `void`
- **Description:** Pushes the appropriate hash string onto `window.location.hash`, triggering a `hashchange` event.

#### `initRouter(handler)`
- **Inputs:** `RouteHandler` (`(route: Route) => void`)
- **Outputs:** `() => void` (teardown)
- **Description:** Attaches a `hashchange` listener that calls `handler(parseHash(hash))`; fires immediately for the current hash so the initial page renders.
- **Workflow:** Creates `onHashChange` closure → adds to `window` → calls it once → returns removal function.

---

## `src/main.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `appEl` | `HTMLElement` | `#app` root mount point |
| `cleanupRoute` | `(() => void) \| null` | Teardown function for the currently mounted route component |
| `INACTIVITY_MS` | `number` | `600_000` ms (10 min) — auto-logout threshold |
| `inactivityTimer` | `ReturnType<setTimeout> \| null` | Handle for the current inactivity timeout |

### Functions

#### `resetInactivityTimer()`
- **Inputs:** none
- **Outputs:** `void`
- **Description:** Clears any existing inactivity timeout and starts a fresh 10-min countdown that calls `signOut()` when it expires. No-ops if no user is logged in.

#### `startInactivityTracking()`
- **Inputs:** none
- **Outputs:** `void`
- **Description:** Attaches passive `click`, `keydown`, `mousemove`, `scroll`, `touchstart` listeners on `window`, each calling `resetInactivityTimer()`. Starts the initial timer.

#### `stopInactivityTracking()`
- **Inputs:** none
- **Outputs:** `void`
- **Description:** Clears the active timeout and nulls the reference; does not remove window listeners (they become no-ops while `user` is null).

#### `handleRoute(route)`
- **Inputs:** `Route`
- **Outputs:** `void`
- **Description:** Auth guard + route dispatcher. Redirects unauthenticated users to `#login` and authenticated users away from `#login` to `#groups`. Tears down the previous component and mounts the new one.
- **Workflow:**
  1. Read `user` from store; apply redirect if auth state mismatches route.
  2. Call `cleanupRoute?.()`, clear `appEl.innerHTML`.
  3. Switch on `route.name`: mount `renderLoginPage`, `renderGroupList`, async-fetch group then `renderExpenseList`, or `renderProfilePage`.
  4. Store returned cleanup function in `cleanupRoute`.

**Entry sequence:** `initAuth(onReady)` → inside `onReady`, register a store subscriber that re-evaluates redirects on auth changes and starts/stops inactivity tracking → call `initRouter(handleRoute)`.

---

## `src/logic/settlement.ts`

### Functions

#### `computeBalances(expenses, members)`
- **Inputs:** `Expense[]`, `GroupMember[]`
- **Outputs:** `Balance[]`
- **Description:** Calculates each member's net balance in cents.
- **Workflow:** Initialises `net[uid]=0`. For each expense, adds full amount to `paidBy`; subtracts equal share (`round(amount/splitCount)`) from each uid in `splitBetween`. Returns mapped `Balance[]`.

#### `simplifyDebts(balances)`
- **Inputs:** `Balance[]`
- **Outputs:** `Settlement[]`
- **Description:** Greedy two-pointer algorithm that minimises the number of payment transactions.
- **Workflow:** Splits balances into `creditors` (net > 0) sorted descending and `debtors` (net < 0) sorted ascending. Pointer sweep: each iteration emits one `Settlement` for `min(credit, |debt|)`, reduces both balances, and advances whichever pointer reaches zero.

#### `formatCents(cents)`
- **Inputs:** `number`
- **Outputs:** `string`
- **Description:** Converts integer cents to display string `$X.XX`.

---

## `src/services/auth.service.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `pendingDisplayName` | `string \| null` | Module-level race-condition guard: set before `createUserWithEmailAndPassword` so the immediately-firing `onAuthStateChanged` can use it without a Firestore round-trip |

### Functions

#### `initAuth(onReady)`
- **Inputs:** `() => void`
- **Outputs:** `() => void` (unsubscribe from auth listener)
- **Description:** Subscribes to Firebase Auth state changes. On sign-in: resolves display name (from `pendingDisplayName` or Firestore) and pushes `user` into store. On sign-out: sets `user: null`. Calls `onReady()` exactly once after the first event settles.

#### `signUp(email, password, displayName)`
- **Inputs:** `string`, `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Creates Firebase Auth user, sets display name on Auth profile, writes Firestore user record, updates store.
- **Workflow:** Sets `pendingDisplayName` → `createUserWithEmailAndPassword` → `updateProfile` → `createUserRecord` → `store.setState` → clears `pendingDisplayName` in `finally`.

#### `signIn(email, password)`
- **Inputs:** `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Signs in via Firebase, then verifies the Firestore user record exists; signs out and throws if missing.

#### `resetPassword(email)`
- **Inputs:** `string`
- **Outputs:** `Promise<void>`
- **Description:** Sends a Firebase password-reset email to the normalized address.

#### `signOut()`
- **Inputs:** none
- **Outputs:** `Promise<void>`
- **Description:** Signs out of Firebase Auth; `onAuthStateChanged` will fire and set `user: null` in store.

---

## `src/services/group.service.ts`

### Functions

#### `toGroup(id, data)` *(private)*
- **Inputs:** `string`, `Record<string, unknown>`
- **Outputs:** `Group`
- **Description:** Maps raw Firestore document data (with `Timestamp`) to a typed `Group` object.

#### `subscribeToGroups(uid, onChange)`
- **Inputs:** `string`, `(groups: Group[]) => void`
- **Outputs:** `Unsubscribe`
- **Description:** Real-time Firestore listener on all groups where `memberUids array-contains uid`; delivers sorted (newest-first) `Group[]` to callback.

#### `createGroup(name, creator)`
- **Inputs:** `string`, `GroupMember`
- **Outputs:** `Promise<string>` (new group ID)
- **Description:** Writes a new group document with the creator as sole member; returns the Firestore-generated ID.

#### `addMemberToGroup(groupId, member)`
- **Inputs:** `string`, `GroupMember`
- **Outputs:** `Promise<void>`
- **Description:** Appends member to both `members[]` and `memberUids[]` via `arrayUnion`.

#### `subscribeToGroup(groupId, onChange)`
- **Inputs:** `string`, `(group: Group | null) => void`
- **Outputs:** `Unsubscribe`
- **Description:** Real-time listener on a single group document; passes `null` if document no longer exists.

#### `getGroup(groupId)`
- **Inputs:** `string`
- **Outputs:** `Promise<Group | null>`
- **Description:** One-time fetch of a group by ID.

#### `removeMemberFromGroup(groupId, member)`
- **Inputs:** `string`, `GroupMember`
- **Outputs:** `Promise<void>`
- **Description:** Removes member from both arrays via `arrayRemove`.

#### `updateGroupName(groupId, name)`
- **Inputs:** `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Updates the `name` field on the group document.

#### `deleteGroup(groupId)`
- **Inputs:** `string`
- **Outputs:** `Promise<void>`
- **Description:** Atomic batch deletion — fetches all expense sub-documents, enqueues their deletes, then deletes the group document; commits in one batch.

---

## `src/services/expense.service.ts`

### Functions

#### `toExpense(id, data)` *(private)*
- **Inputs:** `string`, `Record<string, unknown>`
- **Outputs:** `Expense`
- **Description:** Maps raw Firestore data to a typed `Expense` object.

#### `subscribeToExpenses(groupId, onChange)`
- **Inputs:** `string`, `(expenses: Expense[]) => void`
- **Outputs:** `Unsubscribe`
- **Description:** Real-time listener on `groups/{groupId}/expenses`; delivers sorted (newest-first) array.

#### `addExpense(groupId, description, amountCents, paidBy, splitBetween)`
- **Inputs:** `string`, `string`, `number`, `string`, `string[]`
- **Outputs:** `Promise<void>`
- **Description:** Writes a new expense document to Firestore.

#### `updateExpense(groupId, expenseId, description, amountCents, paidBy, splitBetween)`
- **Inputs:** `string`, `string`, `string`, `number`, `string`, `string[]`
- **Outputs:** `Promise<void>`
- **Description:** Updates description, amount, paidBy, and splitBetween fields on an existing expense.

#### `deleteExpense(groupId, expenseId)`
- **Inputs:** `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Deletes the expense document.

---

## `src/services/user.service.ts`

### Functions

#### `createUserRecord(user)`
- **Inputs:** `User`
- **Outputs:** `Promise<void>`
- **Description:** Writes `uid`, `displayName`, `email`, `createdAt` to `users/{uid}`.

#### `getUserRecord(uid)`
- **Inputs:** `string`
- **Outputs:** `Promise<UserRecord | null>`
- **Description:** Fetches a user document by UID; returns `null` if not found.

#### `updateDisplayName(uid, displayName)`
- **Inputs:** `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Updates `displayName` in both Firestore and Firebase Auth profile simultaneously.

#### `updateUserColor(uid, color)`
- **Inputs:** `string`, `string`
- **Outputs:** `Promise<void>`
- **Description:** Updates the `color` field in the Firestore user document.

#### `getUserColors(uids)`
- **Inputs:** `string[]`
- **Outputs:** `Promise<Record<string, string>>`
- **Description:** Batch-fetches color values for multiple UIDs via `Promise.all`; omits UIDs with no color set.

#### `getUserDisplayNames(uids)`
- **Inputs:** `string[]`
- **Outputs:** `Promise<Record<string, string>>`
- **Description:** Batch-fetches display names for multiple UIDs via `Promise.all`.

#### `getUserByEmail(email)`
- **Inputs:** `string`
- **Outputs:** `Promise<UserRecord | null>`
- **Description:** Queries `users` collection by normalized email; returns first match or `null`.

---

## `src/services/log.service.ts`

### Functions

#### `writeLog(groupId, entry)`
- **Inputs:** `string`, `Omit<LogEntry, 'id' | 'createdAt'>`
- **Outputs:** `Promise<void>`
- **Description:** Appends a log entry (with server timestamp) to `groups/{groupId}/logs`.

#### `subscribeToLogs(groupId, onChange)`
- **Inputs:** `string`, `(logs: LogEntry[]) => void`
- **Outputs:** `Unsubscribe`
- **Description:** Real-time listener on logs ordered by `createdAt` descending.

---

## `src/components/auth/LoginPage.ts`

### Functions

#### `renderLoginPage(container)`
- **Inputs:** `HTMLElement`
- **Outputs:** `void`
- **Description:** Mounts the authentication form; manages a `mode` state (`login` | `signup` | `reset`) and re-renders in place on mode changes.
- **Workflow:** Defines inner `render()` which injects mode-appropriate HTML and rebinds events. Toggle buttons switch `mode` and call `render()`. On form submit: calls `signIn`, `signUp`, or `resetPassword`; shows inline error or success feedback.

#### `friendlyError(err)` *(private)*
- **Inputs:** `unknown`
- **Outputs:** `string`
- **Description:** Maps Firebase Auth error codes (`auth/email-already-in-use`, etc.) to user-facing messages.

---

## `src/components/groups/GroupList.ts`

### Functions

#### `renderGroupList(container)`
- **Inputs:** `HTMLElement`
- **Outputs:** `() => void` (cleanup)
- **Description:** Mounts the group list screen; subscribes to groups; re-renders on every store update.
- **Workflow:** Calls `subscribeToGroups` → callback pushes `{groups, loading:false}` into store and calls `render()`. Inner `render()` reads store and injects HTML. Event wiring: Open → `navigate({name:'group',id})`; Delete → confirm + `deleteGroup`; New → opens `renderGroupCreate` modal.

#### `memberSummary(members)` *(private)*
- **Inputs:** `{displayName: string}[]`
- **Outputs:** `string`
- **Description:** Returns "A, B, C and N more" summary (max 3 names shown).

#### `escapeHtml(s)` *(private)*
- **Inputs:** `string`
- **Outputs:** `string`
- **Description:** Escapes `&`, `<`, `>` for safe HTML insertion.

---

## `src/components/groups/GroupCreate.ts`

### Functions

#### `renderGroupCreate(container, user, onClose)`
- **Inputs:** `HTMLElement`, `User`, `() => void`
- **Outputs:** `void`
- **Description:** Renders the group-creation modal. On submit: calls `createGroup(name, {uid, displayName})` then `onClose()`.
- **Workflow:** Injects modal HTML → binds close on overlay click / cancel / ✕ → form submit validates name, disables button, calls `createGroup`, calls `onClose`.

---

## `src/components/expenses/ExpenseList.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `PALETTE` | `string[]` | 8-entry fallback color palette for avatar generation |

### Functions

#### `avatarColor(uid, colorMap)` *(private)*
- **Inputs:** `string`, `Record<string, string>`
- **Outputs:** `string`
- **Description:** Returns the custom color from `colorMap` if present; otherwise hashes `uid` to a palette entry.

#### `renderExpenseList(container, initialGroup)`
- **Inputs:** `HTMLElement`, `Group`
- **Outputs:** `() => void` (cleanup)
- **Description:** Main group detail screen. Manages three Firestore real-time subscriptions and member profile data; re-renders on any change. Returns a cleanup that cancels all subscriptions.
- **Workflow:**
  1. **`refreshMemberNames()`** — batch-calls `getUserRecord` for all members → populates `memberNameMap` / `memberColorMap` → sets `profilesReady = true` → calls `render()`.
  2. **`render()`** — builds full layout (header, member chips, tab bar, expense filters). Calls inner `renderExpenseItems()` and `renderHistoryItems()`. Mounts `renderSettlementView` in `#settlement-root` when expenses exist.
  3. **`onSettlementConfirmed(from, to, amount)`** — calls `addExpense` with description `'Settlement payment'`.
  4. Subscriptions: `subscribeToGroup` → updates `group`, re-calls `refreshMemberNames`. `subscribeToExpenses` / `subscribeToLogs` → update local arrays, call `render()` when `profilesReady`.

#### `renderRenameModal(container, group, onSave, onClose)` *(private)*
- **Inputs:** `HTMLElement`, `Group`, async save callback, close callback
- **Outputs:** `void`
- **Description:** Inline modal for renaming the group; calls `onSave(newName)` on submit.

#### `renderInviteModal(container, group, onClose)` *(private)*
- **Inputs:** `HTMLElement`, `Group`, `() => void`
- **Outputs:** `void`
- **Description:** Invite modal with two flows: quick-add from contact history (members of other groups) and lookup by email or UID. Both paths call `addMemberToGroup` on success.

#### `escapeHtml(s)` / `formatRelativeTime(date)` *(private)*
- Utility helpers for HTML escaping and relative timestamps ("just now", "5m ago", etc.).

---

## `src/components/expenses/ExpenseForm.ts`

### Functions

#### `renderExpenseForm(container, group, currentUser, onClose, existing?)`
- **Inputs:** `HTMLElement`, `Group`, `User`, `() => void`, `Expense?`
- **Outputs:** `void`
- **Description:** Add/Edit expense modal. When `existing` is provided, pre-fills fields and calls `updateExpense`; otherwise calls `addExpense`. Writes a log entry in both cases.
- **Workflow:** Renders payer `<select>` and split `<checkbox>` list from `group.members`. On submit: parses dollars → cents, calls `addExpense` or `updateExpense`, calls `writeLog`, calls `onClose`.

#### `escapeHtml(s)` *(private)*
- HTML escape utility.

---

## `src/components/settlement/SettlementView.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `PALETTE` | `string[]` | 8-entry fallback color palette |

### Functions

#### `avatarColor(uid, colorMap)` *(private)*
- **Inputs:** `string`, `Record<string, string>`
- **Outputs:** `string`
- **Description:** Returns user color from map or hashed palette fallback.

#### `createGraphSvg(settlements, group, memberColorMap)` *(private)*
- **Inputs:** `Settlement[]`, `Group`, `Record<string, string>`
- **Outputs:** `SVGSVGElement`
- **Description:** Builds a fully interactive force-directed SVG graph with draggable nodes and live-updating curved arrows.
- **Workflow:**
  1. Initialises physics state per node: `{x, y, vx, vy, pinned}` arranged in a circle.
  2. Creates SVG groups for edges and nodes imperatively (no innerHTML).
  3. For each node, attaches `mousedown`/`touchstart` → sets `pinned=true`, zeroes velocity; `mousemove`/`touchmove` → moves node in SVG-coordinate space; `mouseup`/`touchend` → sets `pinned=false`.
  4. `requestAnimationFrame` loop runs `tick()`: applies node–node repulsion (4500/d²), edge spring attraction (`k=0.045`, adaptive rest length), weak center gravity, velocity damping (0.80), velocity cap (12 px/frame), and boundary clamping. Updates all SVG attributes each frame.
  5. Loop self-terminates when `svg.isConnected` is false; window listeners are cleaned up at that point.

#### `renderSettlementView(container, group, expenses, onConfirm, onRenameGroup, memberColorMap, view, onViewChange)`
- **Inputs:** `HTMLElement`, `Group`, `Expense[]`, confirm callback, rename callback, color map, `'list'|'graph'`, view-change callback
- **Outputs:** `void`
- **Description:** Renders balance summary, List/Graph toggle, and suggested payment rows. Appends `createGraphSvg` result into `#settlement-graph-panel` after setting innerHTML.
- **Workflow:** Calls `computeBalances` and `simplifyDebts` to derive data. Injects HTML. Appends SVG element. Wires List/Graph toggle buttons to show/hide panels and call `onViewChange`. Confirm buttons call `onConfirm(from, to, amount)`.

#### `escapeHtml(s)` *(private)*
- HTML escape utility.

---

## `src/components/profile/ProfilePage.ts`

### Global Variables

| Name | Type | Description |
|------|------|-------------|
| `PALETTE` | `string[]` | 8-entry color palette for avatar color swatches |

### Functions

#### `renderProfilePage(container)`
- **Inputs:** `HTMLElement`
- **Outputs:** `void`
- **Description:** Renders the profile screen with avatar color picker and username editor.
- **Workflow:** Inner `render(saving, saved, error)` reads `store.getState().user` and injects HTML. Color swatch click → `updateUserColor` → `store.setState({user: {..., color}})` → `render()`. Username form submit → `updateDisplayName` → `store.setState` → `render(false, true)`.

#### `escapeHtml(s)` *(private)*
- HTML escape utility.
