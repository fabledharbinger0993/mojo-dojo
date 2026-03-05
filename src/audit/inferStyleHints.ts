import { promises as fs } from "node:fs";
import { Dirent } from "node:fs";
import path from "node:path";

export interface StyleInferenceProfile {
  sampleFileCount: number;
  indentation: "tabs" | "2-spaces" | "4-spaces" | "mixed";
  quoteStyle: "single" | "double" | "mixed";
  semicolonStyle: "required" | "optional" | "mixed";
  namingStyle: "camelCase" | "snake_case" | "mixed";
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", ".next", "build", "out"]);

async function collectSourceFiles(root: string, limit: number): Promise<string[]> {
  const queue: string[] = [root];
  const files: string[] = [];

  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= limit) {
        break;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function detectIndentation(text: string): StyleInferenceProfile["indentation"] {
  let tabs = 0;
  let two = 0;
  let four = 0;

  for (const line of text.split(/\r?\n/)) {
    if (/^\t+\S/.test(line)) {
      tabs += 1;
    } else if (/^ {2}\S/.test(line)) {
      two += 1;
    } else if (/^ {4}\S/.test(line)) {
      four += 1;
    }
  }

  const winner = Math.max(tabs, two, four);
  if (winner === 0) {
    return "mixed";
  }
  if ((tabs === winner ? 1 : 0) + (two === winner ? 1 : 0) + (four === winner ? 1 : 0) > 1) {
    return "mixed";
  }
  if (tabs === winner) {
    return "tabs";
  }
  return two >= four ? "2-spaces" : "4-spaces";
}

function detectQuoteStyle(text: string): StyleInferenceProfile["quoteStyle"] {
  const single = (text.match(/'[^'\n]*'/g) ?? []).length;
  const double = (text.match(/"[^"\n]*"/g) ?? []).length;

  if (single === 0 && double === 0) {
    return "mixed";
  }
  if (single > double * 1.2) {
    return "single";
  }
  if (double > single * 1.2) {
    return "double";
  }
  return "mixed";
}

function detectSemicolonStyle(text: string): StyleInferenceProfile["semicolonStyle"] {
  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => /[\w\)\]\}"']$/.test(line));

  if (candidates.length === 0) {
    return "mixed";
  }

  const withSemicolon = candidates.filter((line) => line.endsWith(";")).length;
  const ratio = withSemicolon / candidates.length;

  if (ratio >= 0.75) {
    return "required";
  }
  if (ratio <= 0.25) {
    return "optional";
  }
  return "mixed";
}

function detectNamingStyle(text: string): StyleInferenceProfile["namingStyle"] {
  const snake = (text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? []).length;
  const camel = (text.match(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g) ?? []).length;

  if (snake === 0 && camel === 0) {
    return "mixed";
  }
  if (camel > snake * 1.5) {
    return "camelCase";
  }
  if (snake > camel * 1.5) {
    return "snake_case";
  }
  return "mixed";
}

function toHintString(profile: StyleInferenceProfile): string {
  return [
    `indentation: ${profile.indentation}`,
    `quotes: ${profile.quoteStyle}`,
    `semicolons: ${profile.semicolonStyle}`,
    `naming: ${profile.namingStyle}`,
  ].join("; ");
}

export async function inferStyleHintsFromWorkspace(
  workspaceRoot?: string,
): Promise<{ hints: string; profile: StyleInferenceProfile } | undefined> {
  const root = workspaceRoot && workspaceRoot.length > 0 ? workspaceRoot : process.cwd();
  const files = await collectSourceFiles(root, 30);

  if (files.length === 0) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf8");
      chunks.push(content.slice(0, 3000));
    } catch {
      // Ignore unreadable files and keep inferring from the rest.
    }
  }

  const corpus = chunks.join("\n");
  if (corpus.trim().length === 0) {
    return undefined;
  }

  const profile: StyleInferenceProfile = {
    sampleFileCount: files.length,
    indentation: detectIndentation(corpus),
    quoteStyle: detectQuoteStyle(corpus),
    semicolonStyle: detectSemicolonStyle(corpus),
    namingStyle: detectNamingStyle(corpus),
  };

  return {
    hints: toHintString(profile),
    profile,
  };
}
