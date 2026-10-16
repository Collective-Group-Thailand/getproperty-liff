import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The LIFF-first lint rules live in `eslint.config.mjs` (not a custom rule), so this fixture runs the
 * real project config over virtual files and proves each one fails on what it exists to catch.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.message);
}

describe("LIFF-first lint rules", () => {
  it("refuses window.open in components and plain modules", async () => {
    expect(await messages("src/features/resident/x.ts", `export const go = () => window.open("https://x");\n`)).toEqual(
      [expect.stringMatching(/openExternal/)],
    );
    const tsx = `export function A() {\n  return <button onClick={() => window.open("https://x")} />;\n}\n`;
    expect((await messages("src/features/resident/A.tsx", tsx)).some((m) => /openExternal/.test(m))).toBe(true);
  });

  it("refuses @line/liff outside the wrapper and allows it inside", async () => {
    const code = `import liff from "@line/liff";\nexport const l = liff;\n`;
    expect((await messages("src/features/resident/x.ts", code)).some((m) => /wrapper in @\/lib\/liff/.test(m))).toBe(
      true,
    );
    expect(await messages("src/lib/liff/sdk.ts", code)).toEqual([]);
  });
}, 60_000);
