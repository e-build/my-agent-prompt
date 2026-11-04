import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** `instructions/book.md` is the single source for the rebuild rules. */
export async function loadBookInstructions(): Promise<string> {
  return (
    await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "instructions", "book.md"), "utf8")
  ).trim();
}
