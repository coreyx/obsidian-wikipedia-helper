# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-28

### Added

- The Wikipedia Helper plugin for Obsidian, for Obsidian 1.4.0 and later, on desktop and mobile:
  - **Citation links stay links when pasted:** after Obsidian's own paste, citation links such as `[4]`, `[a]` and `[citation needed]` from the copied HTML are written as `[\[4\]](…)` instead of `[[4]](…)`, which Obsidian read as a wikilink. Nothing else in the paste changes, and the fix undoes with the paste.
  - **Site list:** only pastes copied from listed sites are fixed, `wikipedia.org` by default, each site including its subdomains. A **Restore default** button puts `wikipedia.org` back if the list is emptied.
  - **Unknown source:** when the copied page's address isn't available, the paste is fixed only if it has Wikipedia's citation markup, or, if you choose, left alone.
  - **Any site:** an optional switch that applies the fix to bracketed links copied from any page.
  - **Repair command:** **Repair citation links in selection or note** fixes citations pasted before the plugin was on, for listed sites only.
  - Works alongside paste plugins such as Paste with Source and Link or Card: it never cancels a paste.
