# Release notes

## 0.1.0 - 2026-10-28

The first release of Wikipedia Helper, for Obsidian 1.4.0 and later on desktop and mobile.

### Citations stay clickable when you paste from Wikipedia

When you paste a paragraph from Wikipedia, Obsidian writes its citation markers as `[[4]](…)`, which it then reads as a wikilink to a note named "4". Wikipedia Helper lets Obsidian's paste run as usual and then escapes just those brackets, so each citation becomes a clickable `[4]` that opens the footnote on Wikipedia. Nothing else in the paste changes, and undoing the paste undoes the fix with it.

### You choose which sites it applies to

By default only pastes copied from `wikipedia.org` and its subdomains are fixed, and **Restore default** puts that back if you empty the list. You can add other sites, such as other MediaWiki wikis, or switch on **Fix citation links from any site**. When the browser didn't record which page was copied, or on mobile, the plugin fixes the paste only if it has Wikipedia's citation markup, or, if you prefer, leaves it alone.

### Repair notes you pasted before

The command **Repair citation links in selection or note** fixes citations that were already pasted the broken way, in the selection or the whole note. It only touches links to listed sites, so real wikilinks are left alone, and one undo reverses it.

### Works with other paste plugins

The plugin never cancels a paste, so it works alongside plugins such as Paste with Source and Link or Card.

### Known quirk

In Live Preview, Obsidian shows the escaped brackets as dimmed `[` `]` around the link. Reading view shows a clean `[4]`.

### Installing

Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat): run **BRAT: Add a beta plugin for testing** and enter `coreyx/obsidian-wikipedia-helper`.
