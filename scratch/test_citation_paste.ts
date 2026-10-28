/**
 * Regression checks for the citation paste fix. Run with `pnpm test:scratch`.
 *
 * Turndown, with its Markdown escaping turned off, stands in for Obsidian's HTML-to-Markdown
 * conversion: that's what produces `[[4]](…)` from `<a>[4]</a>`. happy-dom supplies the
 * `DOMParser` the plugin uses on the copied HTML. All page text and addresses are synthetic.
 */
import { EditorState, Transaction } from "@codemirror/state";
import { Window } from "happy-dom";
import TurndownService from "turndown";
import {
  type CitationLink,
  findCitationLinks,
  fixCitationLinks,
  hasMediaWikiCitationMarkup,
  repairMangledLinks,
} from "../src/citations";
import { PasteFixer } from "../src/pasteFix";
import { hostMatches, normalizeSite, sourceUrlFromHtmlFormat } from "../src/sites";

const happyWindow = new Window();
// PasteFixer schedules its disarm with window.setTimeout, as it does in Obsidian.
(globalThis as { window?: unknown }).window = globalThis;

const turndown = new TurndownService();
turndown.escape = (text) => text;

const ARTICLE = "https://en.wikipedia.org/wiki/Example_topic";
const CITATION_NEEDED = "https://en.wikipedia.org/wiki/Wikipedia:Citation_needed";
const ORCHESTRATION = "https://en.wikipedia.org/wiki/Orchestration_(computing)";

/** A synthetic paragraph shaped like a Wikipedia lead, with the markup Wikipedia uses. */
const WIKI_HTML =
  `<p>An example topic has several parts.` +
  `<sup class="reference"><a href="${ARTICLE}#cite_note-4">[4]</a></sup>` +
  `<sup class="reference"><a href="${ARTICLE}#cite_note-5">[5]</a></sup>` +
  ` Its parts work with <a href="${ORCHESTRATION}" title="Orchestration (computing)">orchestration software</a>.` +
  `<sup class="reference"><a href="${ARTICLE}#cite_note-a">[a]</a></sup>` +
  ` Some say otherwise.<sup class="noprint"><a href="${CITATION_NEEDED}" title="Wikipedia:Citation needed">[citation needed]</a></sup>` +
  ` A note named [[Example note]] stays a wikilink.</p>`;

let failures = 0;

/** Prints one check's result and counts failures. */
function check(name: string, passed: boolean, detail?: unknown): void {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) console.log("     ", detail);
  }
}

/** Parses copied HTML the way the plugin's paste handler does. */
function parse(html: string): ParentNode {
  return new happyWindow.DOMParser().parseFromString(html, "text/html") as unknown as ParentNode;
}

/**
 * Removes the backslashes a fix inserted, which should give back the converter's output. Each
 * earlier removal has already shifted the text back, so an original offset is where its
 * backslash now sits.
 */
function unfix(text: string, escapeAt: readonly number[]): string {
  let result = text;
  for (const offset of escapeAt) {
    if (result[offset] !== "\\") return `no backslash at ${offset}`;
    result = result.slice(0, offset) + result.slice(offset + 1);
  }
  return result;
}

const markdown = turndown.turndown(WIKI_HTML);
const links = findCitationLinks(parse(WIKI_HTML));
const fixed = fixCitationLinks(markdown, links);

// 1. The converter reproduces the bug, and the fix changes nothing but the brackets' escapes.
check(
  "1. Turndown produces [[4]](…) and the fix escapes it, byte-identical otherwise",
  markdown.includes(`[[4]](${ARTICLE}#cite_note-4)`) &&
    fixed.text.includes(String.raw`[\[4\]](${ARTICLE}#cite_note-4)`) &&
    unfix(fixed.text, fixed.escapeAt) === markdown &&
    fixed.text.length === markdown.length + 2 * fixed.count,
  { markdown, fixed: fixed.text },
);

// 2. Adjacent, lettered and worded citations are each fixed and stay separate.
check(
  "2. [4][5], [a] and [citation needed] are fixed separately",
  fixed.text.includes(String.raw`[\[4\]](${ARTICLE}#cite_note-4)[\[5\]](${ARTICLE}#cite_note-5)`) &&
    fixed.text.includes(String.raw`[\[a\]](${ARTICLE}#cite_note-a)`) &&
    fixed.text.includes(String.raw`[\[citation needed\]](${CITATION_NEEDED}`) &&
    fixed.count === 4,
  fixed,
);

// 3. Unrecorded targets and literal wikilink text are left alone.
{
  const extra = `${markdown} See [[4]](https://example.org/elsewhere).`;
  const result = fixCitationLinks(extra, links);
  check(
    "3. an unrecorded [[4]](…) and literal [[Example note]] are untouched",
    result.text.includes("[[4]](https://example.org/elsewhere)") &&
      result.text.includes("[[Example note]]") &&
      result.count === 4,
    result.text,
  );
}

// 4. Escaped parentheses and titles in the target still match the recorded link.
{
  const recorded: CitationLink[] = [{ label: "7", href: ORCHESTRATION }];
  const withTitle = turndown.turndown(
    `<a href="${ORCHESTRATION}" title="Orchestration (computing)">[7]</a>`,
  );
  const result = fixCitationLinks(withTitle, recorded);
  check(
    "4. a target with \\( \\) and a title matches its recorded link",
    withTitle.includes(String.raw`Orchestration_\(computing\)`) &&
      withTitle.includes('"Orchestration (computing)"') &&
      result.count === 1 &&
      result.text.startsWith(String.raw`[\[7\]](`),
    { withTitle, result: result.text },
  );
}

// 5. Links whose text only contains brackets, and links without an href, aren't citations.
{
  const found = findCitationLinks(
    parse(`<a href="/a">see [1] here</a><a>[2]</a><a href="">[3]</a><a href="/b">[ 4 ]</a>`),
  );
  check(
    "5. findCitationLinks skips partial brackets and missing hrefs",
    JSON.stringify(found) === JSON.stringify([{ label: "4", href: "/b" }]),
    found,
  );
}

// 6. MediaWiki citation markup is recognized, and an ordinary bracketed link isn't.
check(
  "6. hasMediaWikiCitationMarkup: sup.reference and #cite_note- yes, a plain page no",
  hasMediaWikiCitationMarkup(parse(`<sup class="reference"><a href="/x">[1]</a></sup>`)) &&
    hasMediaWikiCitationMarkup(parse(`<a href="https://example.org/p#cite_note-2">[2]</a>`)) &&
    !hasMediaWikiCitationMarkup(parse(`<p><a href="https://example.org/docs">[docs]</a></p>`)),
);

// 7. Site matching covers subdomains only, ignores case, and normalizes saved entries.
check(
  "7. hostMatches and site normalization",
  hostMatches("https://en.wikipedia.org/wiki/X", ["wikipedia.org"]) &&
    hostMatches("https://en.m.wikipedia.org/wiki/X", ["wikipedia.org"]) &&
    !hostMatches("https://notwikipedia.org/wiki/X", ["wikipedia.org"]) &&
    !hostMatches("https://wikipedia.org.example.com/", ["wikipedia.org"]) &&
    hostMatches("https://EN.WIKIPEDIA.org/", ["Wikipedia.ORG"]) &&
    !hostMatches("not a url", ["wikipedia.org"]) &&
    normalizeSite("https://www.Wikipedia.org/wiki") === "wikipedia.org",
);

// 8. The Windows HTML Format header's SourceURL line is read, and only from the header.
{
  const header = "Version:0.9\r\nStartHTML:00000105\r\nEndHTML:00000180\r\n";
  check(
    "8. sourceUrlFromHtmlFormat",
    sourceUrlFromHtmlFormat(`${header}SourceURL:${ARTICLE}\r\n<html><body>x</body></html>`) ===
      ARTICLE &&
      sourceUrlFromHtmlFormat(`${header}<html><body>x</body></html>`) === null &&
      sourceUrlFromHtmlFormat(`${header}<html>SourceURL:https://example.org/</html>`) === null,
  );
}

// 9. Repairing a note fixes listed-site citations only, never wikilinks.
{
  const note = [
    `A claim.[[4]](${ARTICLE}#cite_note-4)`,
    "Elsewhere.[[4]](https://example.com/page#cite_note-4)",
    "Links: [[Note]], [[Note|alias]], [[Note]] (aside) and [[Note]](aside).",
  ].join("\n");
  const result = repairMangledLinks(note, ["wikipedia.org"]);
  const expected = note.replace(`[[4]](${ARTICLE}`, String.raw`[\[4\]](${ARTICLE}`);
  check(
    "9. repairMangledLinks fixes listed sites only and leaves wikilinks",
    result.text === expected && result.count === 1,
    result,
  );
}

// 10. The transaction filter fixes the paste in the same transaction, keeping its cursor.
{
  const fixer = new PasteFixer();
  const state = EditorState.create({ doc: "Before  after", extensions: fixer.extension });
  fixer.arm({ state }, links);
  const at = "Before ".length;
  const tr = state.update({
    changes: { from: at, insert: markdown },
    selection: { anchor: at + markdown.length },
    userEvent: "input.paste",
  });
  const doc = tr.newDoc.toString();
  const unrelated = tr.state.update({
    changes: { from: 0, insert: markdown },
    userEvent: "input.paste",
  });
  check(
    "10. PasteFixer applies the fix inside the paste transaction, once",
    doc === `Before ${fixed.text} after` &&
      tr.newSelection.main.head === at + fixed.text.length &&
      tr.annotation(Transaction.userEvent) === "input.paste" &&
      unrelated.newDoc.toString().startsWith(markdown),
    doc,
  );
}

await happyWindow.happyDOM.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
