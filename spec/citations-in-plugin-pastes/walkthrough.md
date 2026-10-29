# Walkthrough: Fix citation links in pastes another plugin inserts

Wikipedia Helper now fixes citation links in a paste whichever code inserts it. That covers Obsidian's own paste, and a plugin that cancels the paste and inserts its own conversion, as Table Formatter does for copies that contain a table. The plugin checks the paste in a capture-phase `paste` listener, before every plugin's `editor-paste` handler, so load order no longer decides whether the fix applies. The Table Formatter session reviewed the approach against its 0.2.0 source, and Table Formatter needs no change.

## What Was Implemented

### 1. The fixer (TASK-1)
- **`src/pasteFix.ts`**: `PasteFixer.filter` now fixes the first doc-changing transaction of the armed editor whatever its user event. Before, it fixed only `input.paste`. Table Formatter's `replaceSelection` carries none, so the fixer disarmed without fixing anything. The start-state check, the one-transaction limit, the disarm on the next task and the sequential one-character insertions are unchanged, and the doc comments now describe both kinds of insert.

### 2. The paste handler (TASK-2)
- **`src/main.ts`**: the `editor-paste` registration was replaced by `registerDomEvent(document, "paste", …, { capture: true })`, plus the same listener on each pop-out window's document from the workspace `window-open` event. `handlePaste` now finds the editor itself. It goes on only when `app.workspace.activeEditor`'s CodeMirror `contentDOM` contains the event target, so pastes into settings fields, the search box or other inputs are ignored. Its other checks are unchanged, and it still never calls `preventDefault()` or `stopPropagation()`.

### 3. Verification (TASK-3, TASK-4)
- **`scratch/test_plugin_paste_citations.ts`**: a new regression script. Its "inserted" text has the shape Table Formatter writes, built from a synthetic table with citations in a header cell and a body cell, a link title holding `\|`, and a cited paragraph after the table.
- **`package.json`**: `test:scratch` runs both scratch scripts, so CI and the Release workflow run both.
- A follow-up commit switched the new script's `setTimeout` to `window.setTimeout`, clearing a lint warning it had added.

## Verification & Test Results

### Automated Tests
Ran `pnpm test:scratch`. The new `scratch/test_plugin_paste_citations.ts`:
1. A plugin's untagged `replaceSelection`-shaped insert is fixed in the same transaction, with the cursor at its end: **Passed**
2. Every citation in the table and paragraph is fixed, with the delimiter row, the `\|` in the link title and each row's four unescaped pipes unchanged: **Passed**. The first run failed because the check counted split parts instead of pipes. The test was wrong and the output was right; the count was corrected.
3. A citation joined onto a header label (`Height[[14]](…)`) is fixed: **Passed**
4. Another editor's change is ignored, only one change is fixed, and the fixer disarms on the next task: **Passed**
5. An unrecorded `[[label]](target)` in the insert is unchanged: **Passed**

Against the pre-fix `src/pasteFix.ts`, all five checks fail, so the script catches the bug.

`pnpm lint` (the three expected settings-tab warnings from the first spec), `pnpm format` and `pnpm build` pass.

### Regression Testing
`scratch/test_citation_paste.ts`, the first spec's script, still passes all 10 checks.

### Sandbox checks
These ran in a sandboxed Obsidian 1.14.5 with the vault's installed Paste with Source, Link or Card, Table Formatter 0.2.0 and Eagle Bridge, plus the new build:
- **A real Wikipedia table copy**, taken from the clipboard before the clipboard collision below: Table Formatter's table came out with 103 citation links fixed, none left mangled, and all of them `#cite_note-` footnote links.
- **A synthetic fixture**, pasted with a synthetic paste event that carries its own data, after the clipboard collision below:
  - Wikipedia Helper registered after Table Formatter: all 3 citations fixed, the `\|` intact, and one undo empties the note.
  - Table Formatter registered after Wikipedia Helper: the same result.
  - Wikipedia Helper off: Table Formatter's output is unchanged, `[[14]]` and the rest.
  - Table Formatter off: Obsidian's own paste is still fixed.
  - A note in a pop-out window, with Table Formatter on: all 3 fixed in its padded table.
- For these runs the sandbox's **Fix citation links from any site** was on. A synthetic event's source page comes from the real clipboard, and this change leaves the source check alone.
- **Clipboard collision:** partway through, my clipboard pastes and the Table Formatter session's manual tests overwrote each other's system clipboard. Every result that read the clipboard after that point was discarded and redone with synthetic events, which never touch it. The Table Formatter session said it would restore the user's clipboard when its tests finish.

## Manual Verification
In a test vault with the same plugins, after installing this build (copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/wikipedia-helper/`, then reload the plugin):
1. On https://en.wikipedia.org/wiki/Periodic_table, select from the "Structure" heading through the "Standard atomic weight" lines below the legend, copy, and paste into a new note. The note has `[\[2\]](…#cite_note-CIAAW2013-3)` and `[\[3\]](…#cite_note-CIAAW2021-4)`, the table is a Markdown table, and Reading view shows `[2]` and `[3]` as links. One Ctrl+Z undoes the whole paste.
2. Disable and re-enable Wikipedia Helper so it registers after Table Formatter, and repeat step 1. The same result.
3. Copy only the legend line ("Primordial From decay Synthetic … Border shows natural occurrence of the element") and paste. The note matches what it is with Wikipedia Helper off: three links and Paste with Source's "From: …" line.
4. Copy the lead paragraph of https://en.wikipedia.org/wiki/AI_agent and paste. [4]–[9] are links to the footnotes, and the "From: …" line is appended.
5. Paste step 1's copy with Ctrl+Shift+V. It's plain text, unchanged by either plugin.
6. Open a note in a pop-out window and repeat step 1 there. The same result.
7. Disable Wikipedia Helper and repeat step 1. The citations stay `[[2]](…)`.

Steps 1, 3, 4 and 5 need a real Ctrl+C and Ctrl+V, which the sandbox runs couldn't use reliably once both sessions were using the clipboard.

## Follow-ups
- The stray `[` before `[[Primordial](…)` in a test note is still unexplained. That copy had no bracketed links, so Wikipedia Helper didn't act on it, and it didn't reproduce with any combination of the vault's paste plugins. If it happens again, capture the clipboard before copying anything else and open an investigation.
- Release as 0.1.1 with `prepare-release` once the manual steps pass.
