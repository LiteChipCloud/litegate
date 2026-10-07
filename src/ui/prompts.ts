import * as p from "@clack/prompts";

export function createSelect(message: string, options: { value: string; label: string }[]): Promise<string> {
  return p.select({ message, options, initialValue: options[0]?.value }).then((r) => {
    if (typeof r !== "string") process.exit(0);
    return r;
  });
}
