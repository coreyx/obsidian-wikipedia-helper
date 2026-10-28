import { hostMatches } from "./sites";

/**
 * A link in copied HTML whose whole text is one bracketed label, such as `<a href="…">[4]</a>`.
 * Obsidian's HTML-to-Markdown conversion writes these as `[[4]](…)`, which reads as a wikilink.
 */
export interface CitationLink {
  /** The text between the brackets, with whitespace collapsed: `4`, `a`, `citation needed`. */
  label: string;
  /** The link's `href` attribute, exactly as it appears in the HTML. */
  href: string;
}

/** A whole link text that is one bracketed label, with no brackets inside it. */
const BRACKETED_LABEL = /^\[([^[\]]+)\]$/;

/** Collapses runs of whitespace to one space and trims, as the Markdown converter does. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The anchors among `root`'s links whose text is one bracketed label, paired with that label. */
function citationAnchors(root: ParentNode): { anchor: Element; link: CitationLink }[] {
  const found: { anchor: Element; link: CitationLink }[] = [];
  for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const match = BRACKETED_LABEL.exec(collapseWhitespace(anchor.textContent ?? ""));
    const label = match?.[1]?.trim();
    if (label) found.push({ anchor, link: { label, href } });
  }
  return found;
}

/**
 * Finds the links in copied HTML that Obsidian's paste will turn into `[[label]](…)`: those whose
 * whole text is one bracketed label (`[4]`, `[a]`, `[citation needed]`). A link whose text merely
 * contains brackets (`see [1] here`) is skipped, because its Markdown doesn't start with `[[`.
 */
export function findCitationLinks(root: ParentNode): CitationLink[] {
  return citationAnchors(root).map(({ link }) => link);
}

/**
 * Says whether copied HTML carries MediaWiki's citation markup: a bracketed link inside
 * `sup.reference`, or one pointing at a `#cite_note-` footnote. Used only when the page the HTML
 * came from is unknown, as the evidence that it came from a MediaWiki site such as Wikipedia.
 */
export function hasMediaWikiCitationMarkup(root: ParentNode): boolean {
  return citationAnchors(root).some(
    ({ anchor, link }) =>
      anchor.closest("sup.reference") !== null || link.href.includes("#cite_note-"),
  );
}

/** One `[[label]](target …)` found in Markdown text. */
interface MangledLink {
  /** Where the opening `[[` starts. */
  start: number;
  /** The label as written between `[[` and `]]`. */
  rawLabel: string;
  /** The link target with Markdown escapes undone and any `<…>` wrapping removed. */
  target: string;
}

/**
 * Where a converted link's closing parenthesis ends, and its target, given the index just after
 * `](`. Follows CommonMark's link syntax closely enough for converter output: a target is either
 * `<…>` or a run with balanced parentheses and backslash escapes, optionally followed by a quoted
 * or parenthesized title. Returns `null` when the text isn't a complete link there.
 */
function parseLinkTail(text: string, from: number): { end: number; rawTarget: string } | null {
  let i = from;
  let rawTarget: string;
  if (text[i] === "<") {
    const close = text.indexOf(">", i + 1);
    if (close === -1 || text.slice(i, close).includes("\n")) return null;
    rawTarget = text.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (c === undefined || /\s/.test(c)) break;
      i++;
    }
    rawTarget = text.slice(from, i);
  }
  while (text[i] === " " || text[i] === "\t") i++;
  const opener = text[i];
  if (opener === '"' || opener === "'" || opener === "(") {
    const closer = opener === "(" ? ")" : opener;
    i++;
    while (i < text.length && text[i] !== closer) {
      if (text[i] === "\n") return null;
      i += text[i] === "\\" ? 2 : 1;
    }
    if (i >= text.length) return null;
    i++;
    while (text[i] === " " || text[i] === "\t") i++;
  }
  if (text[i] !== ")") return null;
  return { end: i + 1, rawTarget };
}

/** Undoes Markdown backslash escapes: `Orchestration_\(computing\)` → `Orchestration_(computing)`. */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([^\w\s])/g, "$1");
}

/**
 * Every `[[label]](target)` in Markdown text whose label holds no brackets or newline. A `[[`
 * preceded by an unescaped backslash is literal text, not a link, and is skipped.
 */
function findMangledLinks(markdown: string): MangledLink[] {
  const found: MangledLink[] = [];
  const opening = /\[\[([^[\]\n]+)\]\]\(/g;
  for (let match = opening.exec(markdown); match; match = opening.exec(markdown)) {
    let backslashes = 0;
    while (markdown[match.index - 1 - backslashes] === "\\") backslashes++;
    if (backslashes % 2 === 1) continue;
    const tail = parseLinkTail(markdown, opening.lastIndex);
    if (!tail) continue;
    found.push({
      start: match.index,
      rawLabel: match[1] ?? "",
      target: unescapeMarkdown(tail.rawTarget),
    });
    opening.lastIndex = tail.end;
  }
  return found;
}

/** Decodes percent-escapes where they're valid, so `%28` and `(` compare equal. */
function decodeSafely(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/** The result of fixing links in a piece of Markdown. */
export interface LinkFix {
  /** The Markdown with the fixed links' inner brackets escaped. */
  text: string;
  /** How many links were fixed. */
  count: number;
  /**
   * Offsets in the original Markdown, ascending, at which a backslash was inserted. An editor can
   * apply these as single-character insertions instead of replacing the whole text, which leaves
   * the cursor and every other position where it was.
   */
  escapeAt: number[];
}

/**
 * Rewrites the given mangled links to `[\[label\]](target)`, which renders as a link reading
 * `[label]`. Only two backslashes are added to each, inside its opening `[[label]]`; every other
 * character is kept.
 */
function escapeLinks(markdown: string, links: readonly MangledLink[]): LinkFix {
  const escapeAt = links.flatMap((link) => [link.start + 1, link.start + 2 + link.rawLabel.length]);
  let text = "";
  let copied = 0;
  for (const offset of escapeAt) {
    text += `${markdown.slice(copied, offset)}\\`;
    copied = offset;
  }
  return { text: text + markdown.slice(copied), count: links.length, escapeAt };
}

/**
 * Fixes the citation links in Markdown that Obsidian's paste just produced from HTML: each
 * `[[label]](target)` whose label and target match a link recorded from that HTML becomes
 * `[\[label\]](target)`. The target is compared after undoing Markdown escapes and ignoring any
 * title, so it matches however the converter wrote it. Anything not recorded, literal `[[Note]]`
 * text included, is returned unchanged.
 */
export function fixCitationLinks(markdown: string, links: readonly CitationLink[]): LinkFix {
  const recorded = new Set(links.map((link) => `${link.label}\n${decodeSafely(link.href)}`));
  const matched = findMangledLinks(markdown).filter((link) => {
    const label = collapseWhitespace(unescapeMarkdown(link.rawLabel));
    return recorded.has(`${label}\n${decodeSafely(link.target)}`);
  });
  return escapeLinks(markdown, matched);
}

/**
 * Repairs citation links in a note that was pasted before the plugin was on, with no copied HTML
 * to say which links were citations. A `[[label]](url)` is rewritten only when the URL is an
 * absolute `http(s)` address on a listed site, so a real wikilink followed by a parenthetical
 * (`[[Note]](aside)`) is never touched.
 */
export function repairMangledLinks(markdown: string, sites: readonly string[]): LinkFix {
  const matched = findMangledLinks(markdown).filter(
    (link) => /^https?:\/\//i.test(link.target) && hostMatches(link.target, sites),
  );
  return escapeLinks(markdown, matched);
}
