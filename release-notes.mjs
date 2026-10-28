// Run by the Release workflow: writes the body of the GitHub release for a tag. It's the tag's own
// section of RELEASE_NOTES.md, which prepare-release writes for each version. A tag without one,
// such as a beta cut before the release notes exist, gets notes built from its feat and fix
// commits since the previous tag instead.
//   node release-notes.mjs <tag> <output file>
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * Returns the text under the `## <version>` heading of a release notes file, up to the next
 * level-2 heading, without the heading itself, since the release's title already names the
 * version. Anything after the version on the heading line, such as ` - <date>`, is ignored.
 * Returns `null` when there's no such section or it's empty.
 */
export function notesSection(markdown, version) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## +(\S+)/.exec(line)?.[1] === version);
  if (start === -1) return null;
  const next = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const body = lines
    .slice(start + 1, next === -1 ? lines.length : next)
    .join("\n")
    .trim();
  return body || null;
}

/**
 * Builds release notes from Conventional Commit subjects, listing user-facing changes only:
 * `feat` commits as new features and `fix`/`perf` commits as fixes, each as a sentence.
 */
export function notesFromCommits(subjects) {
  const groups = [
    { title: "New", pattern: /^feat(\([^)]*\))?!?:\s*(.+)$/, items: [] },
    { title: "Fixed", pattern: /^(fix|perf)(\([^)]*\))?!?:\s*(.+)$/, items: [] },
  ];
  for (const subject of subjects) {
    for (const group of groups) {
      const description = group.pattern.exec(subject)?.at(-1);
      if (description) group.items.push(description[0].toUpperCase() + description.slice(1));
    }
  }
  const sections = groups
    .filter((group) => group.items.length > 0)
    .map((group) => `### ${group.title}\n\n${group.items.map((item) => `- ${item}`).join("\n")}`);
  return sections.length > 0 ? sections.join("\n\n") : "No user-facing changes.";
}

/** Returns the commit subjects reachable from `tag` but not from the tag before it, oldest first. */
function subjectsSincePreviousTag(tag) {
  let range = tag;
  try {
    const previous = execFileSync("git", ["describe", "--tags", "--abbrev=0", `${tag}^`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    range = `${previous}..${tag}`;
  } catch {
    // No earlier tag: the release covers all of history.
  }
  const log = execFileSync("git", ["log", "--reverse", "--format=%s", range], { encoding: "utf8" });
  return log.split("\n").filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [tag, output] = process.argv.slice(2);
  if (!tag || !output) throw new Error("usage: node release-notes.mjs <tag> <output file>");
  const prerelease = tag.includes("-");
  let notes = notesSection(await readFile("RELEASE_NOTES.md", "utf8").catch(() => ""), tag);
  if (!notes) {
    notes = notesFromCommits(subjectsSincePreviousTag(tag));
    // A plain release is a draft that's reviewed before publishing, so flag the missing section
    // there rather than failing the run.
    if (!prerelease) console.log(`::warning::RELEASE_NOTES.md has no ## ${tag} section`);
  }
  if (prerelease) {
    notes = `A pre-release for testing. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding \`coreyx/obsidian-wikipedia-helper\`.\n\n${notes}`;
  }
  await writeFile(output, `${notes}\n`);
}
