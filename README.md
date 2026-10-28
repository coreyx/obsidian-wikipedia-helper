# Wikipedia Helper

An Obsidian plugin that keeps citation links such as `[4]` clickable when you paste from Wikipedia, instead of letting them turn into wikilinks.

## What goes wrong

When you copy a paragraph from Wikipedia and paste it into Obsidian, Obsidian converts the copied HTML to Markdown. A citation marker is a link whose text is in square brackets, `<a href="…#cite_note-4">[4]</a>`, and the converter writes it without escaping those brackets:

```markdown
Example text with a claim.[[4]](https://en.wikipedia.org/wiki/Example#cite_note-4)
```

Obsidian reads `[[4]]` as a wikilink to a note named "4". The citation shows up as a link to a note that doesn't exist, followed by a stray URL, and "4" appears among your unresolved links.

## What the plugin changes

Obsidian's paste runs exactly as it always does. For a paste copied from a site on your list, the plugin then escapes the brackets of the citation links it found in the copied HTML, and nothing else:

```markdown
Example text with a claim.[\[4\]](https://en.wikipedia.org/wiki/Example#cite_note-4)
```

That renders as a clickable `[4]` that opens the footnote on Wikipedia. The fix is part of the paste itself, so one Ctrl+Z undoes both.

The plugin never cancels a paste and never converts HTML itself. Only links whose whole text is one bracketed label, such as `[4]`, `[a]` or `[citation needed]`, are changed, and only where the label and address match a link in the copied HTML. Literal `[[Note]]` text, ordinary links and every other part of the paste are left as Obsidian wrote them.

The plugin follows Obsidian's **Settings → Editor → Auto convert HTML** switch: with it off, Obsidian pastes plain text and there's nothing to fix.

## Settings

- **Fix citation links on paste.** Turns the paste fix on or off.
- **Sites.** One site per line, `wikipedia.org` by default. A site covers its subdomains, so `wikipedia.org` includes `en.wikipedia.org` and `en.m.wikipedia.org`. Entries are tidied when saved: `https://www.Example.org/wiki` is stored as `example.org`.
- **When the source site is unknown.** On desktop, the plugin reads the copied page's address from the clipboard. Some browsers don't record it, and on mobile it isn't available. Then the plugin can either act only when the copied HTML has Wikipedia's citation markup (the default), or skip the paste.
- **Fix citation links from any site.** Off by default. When on, the same targeted fix applies to bracketed links copied from any page, and the two settings above don't apply.

## Repairing notes you already pasted

The command **Repair citation links in selection or note** fixes citations that were pasted the broken way. It works on the selection if there is one, otherwise on the whole note, and it changes a `[[label]](url)` only when the address is on a listed site, so a real wikilink followed by a parenthetical is never touched. A notice reports how many links it repaired, and one Ctrl+Z undoes the repair.

The command always uses the Sites list, even with **Fix citation links from any site** on, because a note's text alone can't tell a citation from a wikilink followed by a link.

## Other paste plugins

The plugin never calls `preventDefault()` on a paste, and it does nothing when another plugin already has. That keeps it out of the way of plugins that handle pastes themselves:

- [Paste with Source](https://github.com/coreyx/obsidian-paste-with-source) in its default-plus-source mode lets Obsidian's paste run and then adds its "From: …" line. The citations in the pasted text are fixed, and the "From: …" line is left alone.
- [Link or Card](https://github.com/coreyx/obsidian-link-or-card) handles pastes of a bare URL, which have no citation links, so the two never act on the same paste.

## Installing with BRAT

The plugin isn't in Obsidian's community plugin directory. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT from **Settings → Community plugins**.
2. Run **BRAT: Add a beta plugin for testing** and enter `coreyx/obsidian-wikipedia-helper`.
3. Enable **Wikipedia Helper** in **Settings → Community plugins**.

## Building

With Node 22 and pnpm:

```sh
pnpm install
pnpm build          # type-checks, then bundles src/main.ts into main.js
pnpm test:scratch   # runs the regression checks
```

To try a build, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/wikipedia-helper/`.

## License

[MIT](LICENSE)
