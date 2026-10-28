---
status: approved
---

# Keep pasted citation links from turning into wikilinks

Pasting from Wikipedia turns citation markers like `<a href="…#cite_note-4">[4]</a>` into `[[4]](…)`, because Obsidian's HTML-to-Markdown conversion doesn't escape square brackets inside link text. Obsidian then reads `[[4]]` as a wikilink to a note named "4". This plugin, Wikipedia Helper, leaves Obsidian's paste to run exactly as it does today. Then, for pastes copied from a site on the user's list (by default `wikipedia.org`), it edits only the citation links it found in the copied HTML, rewriting each `[[4]](…)` to `[\[4\]](…)`, which renders as a clickable `[4]`. It never cancels a paste or converts HTML itself, and it doesn't touch any other part of the pasted text.

## User Review Required

> [!IMPORTANT]
> The fix is applied as an edit to the text Obsidian's paste inserted, not by replacing the paste. Ideally it goes into the same editor change as the paste, through a CodeMirror transaction filter, so one Ctrl+Z undoes both together. Whether Obsidian's paste reaches the editor in a form the filter can recognize hasn't been checked yet, so TASK-1 tests it in the vault before anything else is built.
> - **If it works:** the fix is part of the paste itself, with one undo step.
> - **If it doesn't:** the fallback is a separate, equally targeted edit right after the paste. Ctrl+Z then undoes the fix first and the paste second.
>
> I'll report which one applies before continuing past TASK-1.

> [!IMPORTANT]
> Publishing for BRAT means pushing this repo to `coreyx/obsidian-wikipedia-helper` (public) and pushing a version tag, which makes a public GitHub release. I'll ask before the first push and before the tag. The release workflow follows obsidian-project-docs: a pre-release tag (`0.1.0-beta.1`) is published at once as a GitHub pre-release, which BRAT can install; a plain tag (`0.1.0`) creates a draft that you publish by hand.

> [!NOTE]
> **How the source site is found.** During the paste event, the plugin reads the copied page's address from Electron's clipboard, synchronously, the same way paste-with-source does:
> - Windows: the `SourceURL:` line of the `HTML Format` clipboard entry.
> - Chromium on macOS and Linux: `org.chromium.source-url`.
> - Safari: `com.apple.webarchive`.
>
> A listed site matches its subdomains too: `wikipedia.org` covers `en.wikipedia.org` and `en.m.wikipedia.org`. On mobile, and with a browser that doesn't record the address, the source is unknown; see the open question on what to do then.

> [!NOTE]
> How it coexists with your other paste plugins:
> - **paste-with-source**, in its `default+source` paste mode, catches the paste shortcut on `keydown`, lets the native paste run and then appends its citation. This plugin never calls `preventDefault()`, so that native paste still runs. Its edit is limited to the citation links inside the pasted text, and paste-with-source's "From: …" line arrives as a later change, which this plugin doesn't touch.
> - **link-or-card** handles only bare-URL pastes and returns early when `defaultPrevented` is set. This plugin also returns early on `defaultPrevented`, since that means another plugin has taken the paste and the native paste won't run.

> [!NOTE]
> The plugin follows Obsidian's own **Settings → Editor → Auto convert HTML** switch (`autoConvertHtml`). When that's off, Obsidian pastes plain text and there's nothing to fix. Reading the switch uses `vault.getConfig`, which is undocumented; if it's missing, the plugin treats the switch as on.

## Open Questions

None at this time. Resolved at approval:
- **Unknown source site:** defaults to acting only when the HTML has MediaWiki citation markup (`"citation-markup"`), with `"skip"` available as the stricter setting.
- **Author name:** Corey Struzan in `package.json`, `manifest.json` and `LICENSE`.
- **Plugin id and name:** `wikipedia-helper` / **Wikipedia Helper**.
- **`minAppVersion`:** `1.4.0`, unless TASK-1 or the manual checks find a dependency on a newer Obsidian.

## Proposed Changes

### Feasibility check

#### [NEW] `spike/` (deleted once TASK-1 is done; never committed)
- [x] **TASK-1:** In the test vault, with a throwaway plugin build, record what Obsidian's native paste of Wikipedia HTML does to the editor, then try both ways of applying the fix and report which one works:
  - The transactions it dispatches: how many, their `userEvent` annotation (is it `input.paste`?), and whether they happen synchronously after `editor-paste` handlers return.
  - Whether an `EditorState.transactionFilter` can rewrite the inserted text of that transaction, and still leave the cursor at the end of the paste with one undo step.
  - If it can't, a follow-up transaction from an `EditorView.updateListener`: does it reliably see the paste, and how does undo behave?
  - With paste-with-source enabled, the order in which the paste and its "From: …" line arrive.

### Project setup

#### [NEW] `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- [x] **TASK-2:** Create the package (`private`, MIT, author Corey Struzan, `"type": "module"`, pnpm and Node ≥ 22 as in obsidian-project-docs), with scripts `build` (`tsc --noEmit && node esbuild.config.mjs production`), `dev`, `lint`, `format`, `test:scratch` (`tsx scratch/test_citation_paste.ts`) and `version` (`node version-bump.mjs && git add manifest.json versions.json`). Dev dependencies: `obsidian`, `@codemirror/state`, `@codemirror/view`, `typescript`, `esbuild`, `tsx`, `eslint` + `eslint-plugin-obsidianmd`, `prettier`, `@types/node`, and `turndown` + `happy-dom` for the scratch test only.

#### [NEW] `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.gitattributes`
- [x] **TASK-3:** Add the build and lint config, adapted from obsidian-project-docs: esbuild bundles `src/main.ts` to `main.js` as CJS with `obsidian`, `electron`, `@codemirror/*` and `@lezer/*` external; strict TypeScript; `.gitignore` covers `node_modules/`, `main.js`, `data.json` and `spike/`.

#### [NEW] `manifest.json`, `versions.json`, `version-bump.mjs`
- [x] **TASK-4:** Add `manifest.json` (`id: wikipedia-helper`, `name: Wikipedia Helper`, `version: 0.1.0`, `minAppVersion: 1.4.0`, `isDesktopOnly: false`, author Corey Struzan), `versions.json` (`{"0.1.0": "1.4.0"}`) and `version-bump.mjs` copied from obsidian-project-docs.

#### [NEW] `LICENSE`, `README.md`, `CHANGELOG.md`
- [x] **TASK-5:** Add the MIT license (Corey Struzan), a README, and a CHANGELOG with an `Unreleased` section. The README covers what goes wrong and why, what the plugin changes (with a before/after example in synthetic text), the site list and the unknown-source setting, the repair command, how it coexists with other paste plugins, and installing with BRAT (add `coreyx/obsidian-wikipedia-helper`).

### Finding the citations (pure functions, no Obsidian imports)

#### [NEW] `src/sites.ts`
- [x] **TASK-6:** `hostMatches(url: string, sites: string[]): boolean`: true when the URL's hostname equals a listed site or ends with `.` + it, compared case-insensitively. Entries are normalized when saved: lowercased, with a scheme, `www.`, path and port removed. An unparseable URL matches nothing.
- [x] **TASK-7:** `sourceUrlFromHtmlFormat(cfHtml: string): string | null`: pull the `SourceURL:` line out of a Windows `HTML Format` clipboard entry.

#### [NEW] `src/citations.ts`
- [x] **TASK-8:** `findCitationLinks(root: ParentNode): CitationLink[]`: every `a[href]` whose whole trimmed text is one bracketed label with no inner brackets (`[4]`, `[a]`, `[citation needed]`), returned as `{ label, href }`. Links whose text merely contains brackets are skipped: they don't produce `[[`, so they aren't broken.
- [x] **TASK-9:** `hasMediaWikiCitationMarkup(root: ParentNode): boolean`: true when any link found by `findCitationLinks` sits inside `sup.reference` or has an `href` containing `#cite_note-`. Used only when the source site is unknown and the setting allows it.
- [x] **TASK-10:** `fixCitationLinks(markdown: string, links: CitationLink[]): { text: string; count: number }`: rewrite `[[label]](target…)` to `[\[label\]](target…)`, but only where `label` and `target` match a recorded link. The target is compared after undoing Markdown escapes (`\(`, `\)`) and ignoring a trailing `"title"`, so it matches however the converter wrote it. Every other byte of the text is returned unchanged.
- [ ] **TASK-11:** `repairMangledLinks(markdown: string, sites: string[]): { text: string; count: number }`: for notes that were already pasted the broken way. Rewrite `[[label]](url…)` when the label holds no brackets or newline and the URL is absolute `http(s)` on a listed site, so a real wikilink followed by a parenthetical (`[[Note]](aside)`, `[[Note]] (aside)`) is never touched.

### Plugin

#### [NEW] `src/sourceUrl.ts`
- [ ] **TASK-12:** `readSourceUrl(): string | null`: synchronously read the copied page's address from Electron's clipboard: Windows `HTML Format` through `sourceUrlFromHtmlFormat`, then `org.chromium.source-url`, then Safari's `com.apple.webarchive`. Each read is wrapped in `try`/`catch`. The function returns `null` when Electron isn't available (mobile) or nothing gives an `http(s)` address.

#### [NEW] `src/pasteFix.ts`
- [ ] **TASK-13:** `PendingPaste` state plus the CodeMirror extension that applies the fix, implemented in whichever form TASK-1 shows works:
  - The preferred form is an `EditorState.transactionFilter`. It takes the first doc-changing transaction after the plugin arms it, and only if that transaction is the paste per TASK-1's findings. It runs `fixCitationLinks` over that transaction's inserted text only, and returns it with the adjusted insert and the cursor moved to the end of the new text.
  - The fallback is a one-shot `EditorView.updateListener` that dispatches the same targeted replacements as a follow-up transaction.
  - Either way, the plugin disarms after that one transaction or on the next task (`setTimeout(0)`), whichever comes first. A paste that never produced a change (another handler took it) can't make the plugin edit a later, unrelated change.

#### [NEW] `src/main.ts`
- [ ] **TASK-14:** `WikipediaHelperPlugin` (`Plugin`): on load, read settings, add the TASK-13 extension with `registerEditorExtension`, and register the `editor-paste` handler with `registerEvent`.
- [ ] **TASK-15:** `handlePaste(evt, editor)` decides whether to act and, if so, arms the plugin. It never calls `preventDefault()`.
  - It returns without doing anything when the plugin is disabled, `evt.defaultPrevented` is set, `evt.clipboardData` is null or holds files, there's no `text/html`, or `autoConvertHtml` is off.
  - Otherwise it parses the HTML and takes `findCitationLinks`; with none found, it returns.
  - It then decides on the source. With `settings.anySite` on, the source isn't checked. Otherwise it reads `readSourceUrl()`, and a known address must pass `hostMatches(url, settings.sites)`. An unknown one follows `settings.unknownSource`: `"citation-markup"` acts only when `hasMediaWikiCitationMarkup`, and `"skip"` doesn't act.
  - When it does act, it arms `PendingPaste` with the links for that editor's view.
  - Any exception is caught and logged with `console.error`. Since nothing was cancelled, the native paste is unaffected.
- [ ] **TASK-16:** Command `repair-citation-links` ("Repair citation links in selection or note"), an `editorCallback`. It runs `repairMangledLinks` over the selection if there is one, else the whole note, and applies the result as a single `editor.transaction` (one undo step). A `Notice` reports the count ("Repaired 7 citation links" / "No broken citation links found").

#### [NEW] `src/settings.ts`
- [ ] **TASK-17:** `WikipediaHelperSettings { enabled: boolean; sites: string[]; unknownSource: "citation-markup" | "skip"; anySite: boolean }`, with defaults `true`, `["wikipedia.org"]`, `"citation-markup"`, and `false`. The `PluginSettingTab` has:
  - A toggle: "Fix citation links on paste".
  - A textarea: "Sites", one per line, normalized and de-duplicated on save, with a description saying subdomains are included.
  - A dropdown: "When the source site is unknown".
  - A toggle: "Fix citation links from any site", off by default. Its description says it applies the same targeted fix to bracketed links copied from any page. When it's on, the Sites list and the unknown-source dropdown are disabled, since neither applies.
  - The repair command (TASK-16) keeps using the Sites list even with this toggle on, because a note's text alone can't tell a citation from a wikilink followed by a link.

### CI and release

#### [NEW] `.github/workflows/ci.yml`
- [ ] **TASK-18:** On push to `main`, pull requests and manual dispatch, run on ubuntu-latest: install with the pinned pnpm, then `lint`, `format`, `build` and `test:scratch`.

#### [NEW] `.github/workflows/release.yml`
- [ ] **TASK-19:** Adapted from obsidian-project-docs. On a bare version tag (`0.1.0`) or a pre-release tag (`0.1.0-beta.1`):
  - Check the tag against `manifest.json`, then run lint, build and `test:scratch`.
  - Stamp the tag into the released `manifest.json`, and upload `main.js` and `manifest.json`. There's no `styles.css`, since the plugin has none.
  - A pre-release tag is published as a GitHub pre-release, for BRAT; a plain tag becomes a draft.

### Verification

#### [NEW] `scratch/test_citation_paste.ts`
- [ ] **TASK-20:** Write the regression script (see Automated Tests below) and get it passing.

#### [MODIFY] `spec/wikipedia-citation-paste/implementation_plan.md`
- [ ] **TASK-21:** Install the build into the test vault (copy `main.js` and `manifest.json` into `.obsidian/plugins/wikipedia-helper/`), run Manual Verification steps 1–6, and record each result here.
- [ ] **TASK-22:** Run Manual Verification steps 7–11 (with paste-with-source and link-or-card enabled, and the unknown-source cases) and record the results here.

## Verification Plan

### Automated Tests

`pnpm test:scratch` runs `scratch/test_citation_paste.ts` with `tsx`, using happy-dom for `DOMParser` and Turndown to produce the same `[[4]](…)` output Obsidian does. It prints PASS/FAIL per check:

1. A synthetic Wikipedia-style fragment converts with Turndown to `[[4]](https://en.wikipedia.org/wiki/Example#cite_note-4)`, and `fixCitationLinks` turns that into `[\[4\]](https://en.wikipedia.org/wiki/Example#cite_note-4)`. Every other character of the output is byte-identical to Turndown's.
2. Adjacent citations `[4][5]`, a lettered note `[a]` and `[citation needed]` are each fixed and stay separate.
3. A `[[4]](…)` whose URL isn't one of the recorded links is left alone, as is literal `[[Note]]` text elsewhere in the paste.
4. Targets with escaped parentheses (`Orchestration_\(computing\)`) and with a `"title"` still match their recorded link.
5. `findCitationLinks` ignores links whose text only contains brackets (`see [1] here`) and links with no `href`.
6. `hasMediaWikiCitationMarkup` is true for `sup.reference` and `#cite_note-` links, and false for a bracketed link on an ordinary page.
7. `hostMatches`: `en.wikipedia.org` and `en.m.wikipedia.org` match `wikipedia.org`; `notwikipedia.org` and `wikipedia.org.example.com` don't; matching ignores case; an entry saved as `https://www.Wikipedia.org/wiki` is stored as `wikipedia.org`.
8. `sourceUrlFromHtmlFormat` extracts the address from a synthetic `HTML Format` header, and returns `null` when there's no `SourceURL:` line.
9. `repairMangledLinks` fixes `[[4]](https://en.wikipedia.org/…)` and reports the right count. It leaves unchanged `[[4]](https://example.com/…)` (not a listed site), `[[Note]]`, `[[Note|alias]]`, `[[Note]] (aside)` and `[[Note]](aside)`.

### Manual Verification

In a test vault (`<vault>`), with Wikipedia Helper enabled and the default site list:

1. Copy the lead paragraph of https://en.wikipedia.org/wiki/AI_agent, which has citations [4]–[9], and paste it into a new note. Check:
   - In Source mode the citations read `[\[4\]](https://en.wikipedia.org/wiki/AI_agent#cite_note-4)`.
   - In Reading view they show as `[4]` links that open the right footnote.
   - No wikilink to "4" appears among unresolved links.
2. Disable the plugin, paste the same selection into another note, then enable it again. Diff the two notes: the only differences are the backslashes before the citation brackets.
3. Undo the paste from step 1 with Ctrl+Z. Record how many presses it takes; one is expected if TASK-1 found the transaction filter works.
4. Copy a section that has a table, an image and a bulleted list, and paste with the plugin on and off. Apart from citation brackets, the two results are identical.
5. Copy a paragraph with links from a site that isn't on the list, and paste. The result is identical with the plugin on and off.
6. Open the note from step 2, which holds the broken paste, and run **Repair citation links in selection or note**. Its citations become `[\[n\]](…)`, the Notice's count matches the number of citations, and one Ctrl+Z restores the original.
7. Enable paste-with-source in `default+source` paste mode and repeat step 1 with Ctrl+V. The citations are fixed, and the "From: …" line appears once, after the pasted text.
8. Repeat step 7 with Shift+Insert, and with the right-click menu's **Paste (Default Handler) + Source URL**.
9. With link-or-card enabled, paste a bare URL. link-or-card's menu or card appears exactly as it does with this plugin disabled.
10. Paste with Ctrl+Shift+V ("paste as plain text"). The result is plain text, and this plugin changes nothing.
11. Add a second site to the list and paste from it, then remove `wikipedia.org` and paste from Wikipedia. The fix follows the list each time.
    - Where possible, also paste from a browser or device that gives no source address, to confirm the unknown-source setting is followed.
    - Turn on **Fix citation links from any site** and repeat step 5 with a page that has bracketed link text. Its bracketed links are fixed and nothing else changes. Turn the toggle off again, and step 5's result returns.

## Visual design application

The only UI is a settings tab (a toggle, a textarea and a dropdown) and one command, using Obsidian's standard `Setting` components. There is no `design-system.md` or `art-bible.md` in this repo to apply.
