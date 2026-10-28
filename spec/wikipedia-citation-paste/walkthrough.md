# Walkthrough: Keep pasted citation links from turning into wikilinks

Wikipedia Helper is a new Obsidian plugin that leaves Obsidian's own paste untouched and, for pastes copied from a listed site (`wikipedia.org` by default), escapes the brackets of the citation links it found in the copied HTML, so `[[4]](…)` becomes `[\[4\]](…)`, a clickable `[4]`. The fix is added to the paste's own editor change, so it undoes with the paste. A command repairs notes pasted the broken way, and the repo builds, checks and releases the plugin for BRAT.

## What Was Implemented

### 1. Feasibility check (TASK-1)
- A throwaway plugin in the test vault recorded a real Wikipedia paste. Obsidian inserts the converted Markdown in one `input.paste` transaction, synchronously, while the paste event is handled. A CodeMirror transaction filter can add to that transaction with one undo step and the cursor kept at the end; a follow-up `updateListener` dispatch also worked but took two undo steps. The filter was built. On Windows, the clipboard's `HTML Format` carries the page's `SourceURL`. The spike was deleted afterwards.

### 2. Finding and fixing citations (`src/sites.ts`, `src/citations.ts`)
- **`hostMatches`, `normalizeSite`, `normalizeSites`**: a listed site matches itself and its subdomains, case-insensitively; entries are reduced to bare hostnames (`https://www.Example.org/wiki` → `example.org`).
- **`sourceUrlFromHtmlFormat`**: reads `SourceURL:` from the header of a Windows `HTML Format` entry only, so text in the copied HTML can't pose as the source.
- **`findCitationLinks`**: links whose whole text is one bracketed label (`[4]`, `[a]`, `[citation needed]`).
- **`hasMediaWikiCitationMarkup`**: `sup.reference` or `#cite_note-` links, the evidence used when the source page is unknown.
- **`fixCitationLinks`**: escapes `[[label]](target)` only where label and target match a recorded link, comparing targets after undoing Markdown escapes and ignoring titles. It returns the fixed text, the count, and the offsets of the inserted backslashes, so editors can insert just those characters.
- **`repairMangledLinks`**: for notes without the copied HTML, fixes `[[label]](url)` only when the URL is an absolute `http(s)` address on a listed site.

### 3. The plugin (`src/sourceUrl.ts`, `src/pasteFix.ts`, `src/main.ts`, `src/settings.ts`, `src/settingTab.ts`)
- **`readSourceUrl`**: synchronously reads the copied page's address from Electron's clipboard: Windows `HTML Format`, then `org.chromium.source-url`, then Safari's web archive; `null` on mobile or when no browser recorded one.
- **`PasteFixer`**: armed by the paste handler, it recognizes the armed editor's next `input.paste` transaction (by its start state) and appends the backslash insertions as a sequential change in the same transaction. It disarms after one transaction or on the next task, so a paste another handler took can't make it edit something later.
- **`WikipediaHelperPlugin.handlePaste`**: never cancels the paste. It returns early when disabled, when another handler already prevented the paste, for files, for no HTML, or when **Auto convert HTML** is off; otherwise it finds the citation links, checks the source against the site list, the unknown-source setting or the any-site switch, and arms the fixer.
- **Repair citation links in selection or note**: one editor transaction, so one undo; a notice reports the count. It always uses the Sites list.
- **Settings**: Fix citation links on paste, Sites, When the source site is unknown (`citation-markup` or `skip`), Fix citation links from any site. The model and its validation (`readSettings`) are in `src/settings.ts` with no Obsidian imports, so the scratch test covers them; the tab is in `src/settingTab.ts`. That split is a small departure from the plan, which put both in `src/settings.ts`.

### 4. Project, CI and release
- `package.json` (pnpm, Node 22), TypeScript, esbuild (CJS bundle with Obsidian, Electron and CodeMirror external, no Node built-ins, so it loads on mobile), ESLint with `eslint-plugin-obsidianmd`, Prettier, LF line endings.
- `manifest.json` (`wikipedia-helper`, 0.1.0, `minAppVersion` 1.4.0, not desktop-only), `versions.json`, `version-bump.mjs`.
- `.github/workflows/ci.yml`: lint, format check, build and the scratch test on ubuntu-latest.
- `.github/workflows/release.yml`: a pre-release tag (`0.1.0-beta.1`) becomes a published GitHub pre-release for BRAT, with the tag stamped into the released `manifest.json`; a plain tag becomes a draft. It uploads `main.js` and `manifest.json`.
- `LICENSE` (MIT), `README.md`, `CHANGELOG.md`.

## Verification & Test Results

### Automated Tests
Ran `pnpm test:scratch` (`scratch/test_citation_paste.ts`, Turndown with escaping off standing in for Obsidian's converter, happy-dom for `DOMParser`):
1. Turndown reproduces `[[4]](…)`, and the fix escapes it with every other character unchanged: **Passed**
2. `[4][5]`, `[a]` and `[citation needed]` are fixed separately: **Passed**
3. An unrecorded `[[4]](…)` and literal `[[Example note]]` are untouched: **Passed**
4. A target with `\(` `\)` and a title matches its recorded link: **Passed**
5. `findCitationLinks` skips partial brackets and missing hrefs: **Passed**
6. `hasMediaWikiCitationMarkup` true for `sup.reference` and `#cite_note-`, false for a plain page: **Passed**
7. `hostMatches` and site normalization: **Passed**
8. `sourceUrlFromHtmlFormat`, header only: **Passed**
9. `repairMangledLinks` fixes listed sites only and leaves wikilinks: **Passed**
10. `PasteFixer` applies the fix inside the paste transaction, once, keeping the cursor: **Passed** (added beyond the plan's nine)

`pnpm lint`, `pnpm format` and `pnpm build` pass. Lint reports two warnings, both expected: the settings tab uses `display()` instead of the declarative settings API, which needs Obsidian 1.13 while the plugin supports 1.4, and the Obsidian rule set doesn't allow disabling those rules.

### Regression Testing
This is the repo's first spec, so there were no earlier scratch scripts to re-run. Each module was also checked as it was written with throwaway scripts in the gitignored `spike/` folder.

## Manual Verification
Done for TASK-21 and TASK-22, first by hand in a test vault and then in a sandboxed Obsidian 1.14.5 driven over DevTools, pasting real Chrome copies, with paste-with-source (`default+source`) and link-or-card enabled. Results are recorded under those items in the [plan](implementation_plan.md). In short, everything passed, with these observations:
- **Live Preview** draws the escaped brackets as dimmed `[` `]` around the linked `[4]`, so it reads `[[4]]`; Reading view shows a clean `[4]`. That's how Obsidian's editor shows escapes.
- **Undo**: with paste-with-source on, its "From: …" line is a separate undo step whether or not this plugin is on, so undoing a paste can take two presses. Without it, one press undoes the paste and its fix.
- **paste-with-source's right-click "Paste (Default Handler) + Source URL"** inserts only the "From: …" line: its handler inserts an empty paste plus the citation. That's in paste-with-source, not this plugin.

To repeat the core check: with the plugin enabled, copy the lead paragraph of https://en.wikipedia.org/wiki/AI_agent, paste it into a note, and check in Reading view that [4]–[9] are links to the footnotes and that no "4" appears among unresolved links.

## Follow-ups
- Published: `main` is on [coreyx/obsidian-wikipedia-helper](https://github.com/coreyx/obsidian-wikipedia-helper), and [0.1.0-beta.1](https://github.com/coreyx/obsidian-wikipedia-helper/releases/tag/0.1.0-beta.1) is a GitHub pre-release with `main.js` and `manifest.json`, installable with BRAT. The Release workflow didn't run on the tag's first push, made right after the first push to the new repo, so the tag was deleted and pushed again on the same commit.
- Sites setting: an empty list shows the `wikipedia.org` placeholder, so it looks like the default. Fixed in 0.1.0 with a clearer placeholder and a Restore default button.
- paste-with-source: "Paste (Default Handler) + Source URL" didn't paste the clipboard (see above). Since fixed in paste-with-source.
- Possible option: an output format that renders cleanly in Live Preview too, such as `<sup><a href="…">[4]</a></sup>`, at the cost of HTML in the note.
- Possible option: adopt the declarative settings API (searchable settings) if `minAppVersion` is ever raised to 1.13.
