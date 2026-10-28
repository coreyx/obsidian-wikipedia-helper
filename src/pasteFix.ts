import {
  EditorState,
  type Extension,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { type CitationLink, fixCitationLinks } from "./citations";

/** A paste the plugin has decided to fix, waiting for the editor change that inserts it. */
export interface PendingPaste {
  /** The editor being pasted into. Only its `state` is read, to recognize its transactions. */
  view: Pick<EditorView, "state">;
  /** The citation links found in the copied HTML; only these are fixed. */
  links: CitationLink[];
}

/**
 * Applies the citation fix to the one editor change a paste produces. The `editor-paste` handler
 * arms it; Obsidian then inserts the converted Markdown in a single `input.paste` transaction,
 * synchronously, before the paste event finishes. A CodeMirror transaction filter adds the
 * backslashes to that same transaction, so the paste and its fix are one change and one undo step.
 */
export class PasteFixer {
  private pending: PendingPaste | null = null;
  private disarmTimer: number | null = null;

  /** The editor extension that applies the fix; register it once with `registerEditorExtension`. */
  readonly extension: Extension = EditorState.transactionFilter.of((tr) => this.filter(tr));

  /**
   * Arms the fixer for the next change to `view`. It disarms after that one transaction, or on
   * the next task if no change arrives, as happens when another handler takes the paste, so a
   * paste that never landed can't make the plugin edit some later, unrelated change.
   */
  arm(view: PendingPaste["view"], links: CitationLink[]): void {
    this.disarm();
    this.pending = { view, links };
    this.disarmTimer = window.setTimeout(() => this.disarm(), 0);
  }

  /** Forgets any armed paste. */
  disarm(): void {
    this.pending = null;
    if (this.disarmTimer !== null) window.clearTimeout(this.disarmTimer);
    this.disarmTimer = null;
  }

  /**
   * Passes every transaction through unchanged except the armed paste. Before a transaction
   * applies, its editor's `state` is still the transaction's start state, which is how the armed
   * editor's transaction is told apart from another editor's.
   */
  private filter(tr: Transaction): Transaction | TransactionSpec[] {
    const pending = this.pending;
    if (!pending || !tr.docChanged || tr.startState !== pending.view.state) return tr;
    this.disarm();
    if (!tr.isUserEvent("input.paste")) return tr;

    // Each inserted range is fixed on its own, and the fix is a set of one-character insertions
    // positioned in the pasted document, so the paste's own cursor placement maps through intact.
    const escapes: { from: number; insert: string }[] = [];
    tr.changes.iterChanges((_fromA, _toA, fromB, _toB, inserted) => {
      const fix = fixCitationLinks(inserted.toString(), pending.links);
      for (const offset of fix.escapeAt) escapes.push({ from: fromB + offset, insert: "\\" });
    });
    if (escapes.length === 0) return tr;
    return [tr, { changes: escapes, sequential: true }];
  }
}
