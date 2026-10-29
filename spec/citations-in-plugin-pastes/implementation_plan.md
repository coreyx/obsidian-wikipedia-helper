---
status: approved
---

# Fix citation links in pastes another plugin inserts

When copied HTML contains a table, Table Formatter cancels Obsidian's paste and inserts its own Markdown with `editor.replaceSelection`. Its citation links come out as `[[2]](…#cite_note-…)`, and Wikipedia Helper never fixes them. If Table Formatter's handler runs first, Wikipedia Helper sees `defaultPrevented` and steps aside. If Wikipedia Helper runs first, it waits for Obsidian's own `input.paste` editor change, which never comes. This change makes Wikipedia Helper decide on the paste before any plugin's handler runs, and fix whichever editor change the paste produces, from Obsidian or from a plugin. Table Formatter needs no change; its session reviewed the approach and confirmed the details below.

**Related documents**
- [Plan for the original plugin](../wikipedia-citation-paste/implementation_plan.md)
- [Walkthrough for the original plugin](../wikipedia-citation-paste/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> This reverses one coexistence rule from the original plan. Wikipedia Helper used to leave a paste alone once another plugin had cancelled it. Now it also fixes text that another plugin inserts while handling the paste. What it changes stays the same: only `[[label]](target)` pairs whose label and href were found in the copied HTML get their two backslashes, nothing else in the text is touched, and the fix stays in the same editor change, so one undo still reverses both. A plugin that inserts later, after the paste event has finished (Eagle Bridge uploading an image, say), is still left alone, because the fixer disarms on the next task.

> [!NOTE]
> **How the earlier decision works.** Obsidian's `editor-paste` handlers run in the order plugins registered them, which depends on load order. The plugin instead listens for the DOM `paste` event in the capture phase on `document`, which runs before CodeMirror and every `editor-paste` handler. It does the same checks as today and arms the fixer, and never calls `preventDefault()` or `stopPropagation()`, so Obsidian's paste and every plugin's handler see the event unchanged. Pop-out windows get the same listener, through the workspace's `window-open` event, as Table Formatter does for its keydown listener.

> [!NOTE]
> Facts from the Table Formatter session, checked against its 0.2.0 source:
> - **One synchronous insert:** its handler converts, calls `preventDefault()` and makes one `replaceSelection` call, with no timers or later edits.
> - **Same converter:** text outside tables is Obsidian's `htmlToMarkdown` output byte for byte. Each cell's content also goes through `htmlToMarkdown`, then gets trimmed, has U+00A0 turned into a space, has line breaks folded into `<br>`, and has unescaped `|` written as `\|`. Wikipedia Helper already undoes Markdown escapes before comparing a target, so `\|` matches. A header spread over several rows keeps each citation intact (`Height[[14]](…)`).
> - **No `[[…]]` handling of its own**, and column padding is cosmetic: the two added backslashes per citation leave the source columns slightly uneven, which GFM ignores.
> - **Ctrl+Shift+V:** both plugins step aside. That paste carries only `text/plain`, so there's nothing to fix.

> [!NOTE]
> The stray `[` in the user's `[[Primordial](…)` note isn't part of this change. Its clipboard had no bracketed links, so Wikipedia Helper doesn't act on it, and it didn't reproduce with any combination of the vault's paste plugins. If it happens again, the clipboard gets captured before anything else is copied, and it becomes its own investigation.

## Open Questions

None at this time.

## Proposed Changes

### The fixer

#### [MODIFY] `src/pasteFix.ts`
- [x] **TASK-1:** In `PasteFixer.filter`, fix the first doc-changing transaction of the armed editor whatever its user event, instead of only `input.paste`. Keep the start-state check that tells the armed editor's transactions from other editors', the disarm after that one transaction, the disarm on the next task, and the sequential one-character insertions. Update the class and method doc comments: the transaction is Obsidian's paste or a plugin's insert made while handling it.

### The paste handler

#### [MODIFY] `src/main.ts`
- [x] **TASK-2:** Replace the `editor-paste` registration with a capture-phase `paste` listener, `registerDomEvent(document, "paste", …, { capture: true })`, and register the same listener on each pop-out window's document from the workspace `window-open` event. The handler finds the editor as `app.workspace.activeEditor?.editor` and goes on only when that editor's `cm.contentDOM` contains `evt.target`, so pastes into other inputs (settings fields, the search box, other CodeMirror instances) are ignored. The checks after that are unchanged: enabled, no files, HTML present, Auto convert HTML on, citation links found, source allowed. It keeps the `defaultPrevented` early return, since only an earlier capture listener could have set it, and it never calls `preventDefault()` or `stopPropagation()`. Update the `handlePaste` doc comment and the class comment to describe the new order.

### Verification

#### [NEW] `scratch/test_plugin_paste_citations.ts`
- [x] **TASK-3:** A regression script for this change, run with `tsx` like the existing one. The checks are listed under Verification Plan below.

#### [MODIFY] `package.json`
- [ ] **TASK-4:** Make `test:scratch` run both scratch scripts, `scratch/test_citation_paste.ts` and then `scratch/test_plugin_paste_citations.ts`, so CI and the Release workflow run both.

## Verification Plan

### Automated Tests
`pnpm test:scratch` runs the existing `scratch/test_citation_paste.ts` as a regression check, then the new `scratch/test_plugin_paste_citations.ts`, which checks that:
1. A transaction with no `input.paste` user event, shaped like `replaceSelection`, is fixed when the fixer is armed, in the same transaction, with the cursor kept at the end of the insert.
2. Table Formatter-shaped output is fixed. That's a GFM table with a citation in one cell, a link whose title holds `\|` in another, and a cited paragraph after the table. Every recorded citation gets escaped, with every `|` and `\|` and the delimiter row left unchanged.
3. A citation joined onto a header label (`Height[[14]](…)`) is fixed.
4. The fixer still ignores another editor's transaction, fixes only one transaction, and disarms on the next task when nothing is inserted.
5. A non-citation `[[Note]](…)` in the inserted text, one that isn't among the recorded links, is left unchanged.

`pnpm lint`, `pnpm format` and `pnpm build` must also pass.

### Manual Verification
In a test vault (Table Formatter, Paste with Source, Link or Card and Eagle Bridge enabled), or a sandboxed Obsidian with the same plugins:
1. On https://en.wikipedia.org/wiki/Periodic_table, select from the "Structure" heading through the "Standard atomic weight" lines below the legend, copy, and paste into a new note. Check that the note has `[\[2\]](…#cite_note-CIAAW2013-3)` and `[\[3\]](…#cite_note-CIAAW2021-4)`, that the table is still a Markdown table, and that Reading view shows `[2]` and `[3]` as links. Press Ctrl+Z once: the whole paste is undone.
2. Reverse the load order: disable and re-enable Wikipedia Helper so it registers after Table Formatter, then repeat step 1. The same result.
3. Copy only the legend line ("Primordial From decay Synthetic … Border shows natural occurrence of the element") and paste. The note matches what it is with Wikipedia Helper off: three links and Paste with Source's "From: …" line.
4. Copy the lead paragraph of https://en.wikipedia.org/wiki/AI_agent and paste. [4]–[9] are links to the footnotes, and the "From: …" line is appended.
5. Paste step 1's copy with Ctrl+Shift+V. It's plain text, unchanged by either plugin.
6. Open a note in a pop-out window and repeat step 1 there. The same result.
7. Disable Wikipedia Helper and repeat step 1. The citations stay `[[2]](…)`, as Table Formatter writes them on its own.
