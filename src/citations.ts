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
