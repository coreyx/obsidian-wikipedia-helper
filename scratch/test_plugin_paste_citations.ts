/**
 * Regression checks for fixing citation links in a paste another plugin inserts, such as Table
 * Formatter's. Run with `pnpm test:scratch`.
 *
 * The inserted Markdown below is the shape Table Formatter 0.2.0 writes for the copied table: a
 * padded GFM table whose cells went through Obsidian's HTML-to-Markdown conversion, with `|` in
 * cell text escaped as `\|`, followed by the paragraphs after the table. happy-dom supplies the
 * `DOMParser` the plugin uses on the copied HTML. All page text and addresses are synthetic.
 */
import { EditorState } from "@codemirror/state";
import { Window } from "happy-dom";
import { findCitationLinks } from "../src/citations";
import { PasteFixer } from "../src/pasteFix";

const happyWindow = new Window();
// PasteFixer schedules its disarm with window.setTimeout, as it does in Obsidian.
(globalThis as { window?: unknown }).window = globalThis;

const LIST = "https://en.wikipedia.org/wiki/Example_list";
const TOWER = "https://en.wikipedia.org/wiki/Example_tower";

/** Copied HTML: a table with citations in a header cell and a body cell, then a cited paragraph. */
const COPIED_HTML =
  `<table class="wikitable"><tbody>` +
  `<tr><th>Name</th><th>Height<sup class="reference"><a href="${LIST}#cite_note-14">[14]</a></sup></th><th>Notes</th></tr>` +
  `<tr><td><a href="${TOWER}" title="Example | tower">Example tower</a></td><td>828</td>` +
  `<td>Tallest<sup class="reference"><a href="${LIST}#cite_note-gt-15">[15]</a></sup></td></tr>` +
  `</tbody></table>` +
  `<p>Heights are measured to the architectural top.` +
  `<sup class="reference"><a href="${LIST}#cite_note-16">[16]</a></sup></p>`;

/** Builds Table Formatter's output for COPIED_HTML, with each citation written by `cite`. */
function tableFormatterOutput(cite: (label: string, target: string) => string): string {
  return [
    `| Name | Height${cite("14", `${LIST}#cite_note-14`)} | Notes |`,
    `| ---- | ------ | ----- |`,
    `| [Example tower](${TOWER} "Example \\| tower") | 828 | Tallest${cite("15", `${LIST}#cite_note-gt-15`)} |`,
    ``,
    `Heights are measured to the architectural top.${cite("16", `${LIST}#cite_note-16`)}`,
  ].join("\n");
}

const inserted = tableFormatterOutput((label, target) => `[[${label}]](${target})`);
const expected = tableFormatterOutput((label, target) => `[\\[${label}\\]](${target})`);
const links = findCitationLinks(
  new happyWindow.DOMParser().parseFromString(COPIED_HTML, "text/html") as unknown as ParentNode,
);

let failures = 0;

/** Prints one check's result and counts failures. */
function check(name: string, passed: boolean, detail?: unknown): void {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) console.log("     ", detail);
  }
}

/** An editor state with the fixer installed, holding `doc`. */
function editorWith(fixer: PasteFixer, doc: string): EditorState {
  return EditorState.create({ doc, extensions: fixer.extension });
}

/**
 * The transaction Obsidian's `editor.replaceSelection` makes for a plugin's insert: the text at
 * the cursor, the cursor after it, and no `input.paste` user event.
 */
function replaceSelection(state: EditorState, text: string) {
  const at = state.selection.main.head;
  return state.update({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
  });
}

// 1. A plugin's insert, with no input.paste user event, is fixed in its own transaction.
{
  const fixer = new PasteFixer();
  const state = editorWith(fixer, "");
  fixer.arm({ state }, links);
  const tr = replaceSelection(state, inserted);
  check(
    "1. A plugin's untagged insert is fixed in the same transaction, cursor at its end",
    tr.newDoc.toString() === expected && tr.newSelection.main.head === expected.length,
    tr.newDoc.toString(),
  );
}

// 2. Table Formatter's table keeps its structure: pipes, \| escapes and the delimiter row.
{
  const fixer = new PasteFixer();
  const state = editorWith(fixer, "");
  fixer.arm({ state }, links);
  const lines = replaceSelection(state, inserted).newDoc.toString().split("\n");
  // Unescaped pipes per row; a three-column row has four.
  const pipes = (line: string) => line.replace(/\\\|/g, "").split("|").length - 1;
  check(
    "2. Every citation in the table and paragraph is fixed, with the table's pipes unchanged",
    links.length === 3 &&
      lines[1] === "| ---- | ------ | ----- |" &&
      lines[2]?.includes('"Example \\| tower"') === true &&
      lines.slice(0, 3).every((line) => pipes(line) === 4) &&
      lines[4]?.endsWith(`[\\[16\\]](${LIST}#cite_note-16)`) === true,
    lines,
  );
}

// 3. A citation joined onto a header label, as Table Formatter writes it, is fixed.
{
  const fixer = new PasteFixer();
  const state = editorWith(fixer, "");
  fixer.arm({ state }, links);
  const doc = replaceSelection(state, inserted).newDoc.toString();
  check(
    "3. A citation joined onto a header label is fixed",
    doc.startsWith(`| Name | Height[\\[14\\]](${LIST}#cite_note-14) |`),
    doc.split("\n")[0],
  );
}

// 4. Another editor's change is ignored, one change is fixed, and nothing is fixed after the task.
{
  const fixer = new PasteFixer();
  const armed = editorWith(fixer, "");
  const other = editorWith(fixer, "");
  fixer.arm({ state: armed }, links);
  const otherDoc = replaceSelection(other, inserted).newDoc.toString();
  const first = replaceSelection(armed, inserted);
  const second = replaceSelection(first.state, inserted).newDoc.toString();

  const late = new PasteFixer();
  const lateState = editorWith(late, "");
  late.arm({ state: lateState }, links);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lateDoc = replaceSelection(lateState, inserted).newDoc.toString();
  check(
    "4. Another editor's change is ignored, one change is fixed, and the fixer disarms on the next task",
    otherDoc === inserted &&
      first.newDoc.toString() === expected &&
      second === expected + inserted &&
      lateDoc === inserted,
    { otherDoc, second, lateDoc },
  );
}

// 5. A [[Note]](…) in the insert that isn't a recorded citation is left alone.
{
  const fixer = new PasteFixer();
  const state = editorWith(fixer, "");
  fixer.arm({ state }, links);
  const withNote = `${inserted}\n\nSee [[Example note]](${TOWER}) and [[14]](${TOWER}).`;
  const doc = replaceSelection(state, withNote).newDoc.toString();
  check(
    "5. An unrecorded [[label]](target) in the insert is unchanged",
    doc === `${expected}\n\nSee [[Example note]](${TOWER}) and [[14]](${TOWER}).`,
    doc,
  );
}

await happyWindow.happyDOM.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
