# macOS validation — 2026-10-26

This is an integration preview, not a claim that the full MiMo task flow passed.

## Environment

- Actual machine: Apple Silicon arm64, macOS 27.0.1 (26A434).
- Installed Xiaomi MiMo Desktop: 26.1014.140704.
- Base main: b6a90bc001f788bc0036382db35734253039ff04.
- Test workbench state was isolated from normal application data. Only dedicated marked test conversations were created; existing conversations and roles were not overwritten.

## Confirmed on the actual Mac

- Installed app discovery and launch; real Application Support API descriptor; authenticated loopback health (`api: 1`, `engine: ready`) and session/message listing.
- Native Swift bridge compiled for arm64; white application UI, original anime avatars and PM/Coder/QA defaults opened correctly.
- macOS Accessibility grant and account display/name reading; active account-menu refresh established its signed-in marker. The actual account name is omitted here.
- Available model list read from MiMo UI; model selection and the actual Desktop message model identity cross-checked. Built-in display names and the observed canonical ID casing are handled explicitly.
- Single-Bot flow created a new marked Desktop session and submitted exactly one harmless initialization; model identity was recorded before submission.
- Group flow created a distinct first member session. On initialization error it stopped, retained review state, left the remaining two members uncreated, and did not bind a failed conversation.
- Explicit recovery and application restart did not add another user message to submitted test conversations. Review records remained available.
- Test conversations contained no tool calls. No personal Desktop conversation was reused.
- Ad-hoc bundle signature integrity verified. No Developer ID identity was available; no Apple notarization performed.

## Integration blockers and unverified items

The local MiMo itself returned these messages during real requests:

- `当前请求过于频繁，请稍后重试` for the token-based Flash selection. The retrying test turn was stopped in MiMo before further tests.
- `未开通会员或会员已到期，请开通或续订会员后重试` for the built-in Pro selection, including the group member initialization.

Accordingly, **a successful model reply, automatic completion/binding of one Bot, completion of all three group bindings, and binding independence across two real groups have NOT passed end-to-end on this account**. The controls remain visible and failures are reported. No simulated replies, remote model API, CLI or DSH substitute was used. A usable Desktop account/model is needed to finish these checks. No purchase was made.

## Automated checks

`npm test`: 35 passing checks. They include existing task idempotency/restart handling, private/group isolation, a second group's independent sessions, exact marker/parent identity, model mismatch rejection, durable macOS pre-submit model checkpoint, result-only handshake rejection, account display validation, OS path resolution, Windows non-blocking launch and loopback/credential-redaction behavior.

These checks use fixtures where appropriate; their success is separate from the real Desktop results above. Cross-platform GitHub CI compiles both native helpers; Windows UI operation still requires a Windows machine for full regression testing.

## Packaging boundary

DMG is built from the release tag's source commit after this report is committed. Post-DMG install/launch results, SHA-256, exact source commit and public asset URLs are recorded in the release notes and the delivered report, to avoid changing source after the tagged build. Only arm64 is built in this release. Intel x64 is neither built nor hardware-tested.
