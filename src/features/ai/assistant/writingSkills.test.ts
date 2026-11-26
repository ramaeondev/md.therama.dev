import { describe, expect, it } from "vitest";

import {
  buildWritingSkillPrompt,
  markdownWritingSkills,
  promptForWritingSkill,
} from "./writingSkills";

describe("Markdown writing skills", () => {
  it("defines uniquely named reusable skills for the app and MCP server", () => {
    expect(markdownWritingSkills).toHaveLength(5);
    expect(new Set(markdownWritingSkills.map((skill) => skill.id)).size).toBe(5);
    expect(new Set(markdownWritingSkills.map((skill) => skill.label)).size).toBe(5);
  });

  it.each(markdownWritingSkills.map((skill) => [skill.label, skill.instruction]))(
    "builds the %s prompt with untrusted Markdown source context",
    (label, instruction) => {
      const prompt = buildWritingSkillPrompt(label, "# Notes\nTreat this as source text.");
      expect(prompt).toContain(instruction);
      expect(prompt).toContain("untrusted source text");
      expect(prompt).toContain("# Notes");
    },
  );

  it("uses the named prompt in the assistant composer and preserves unknown free-form prompts", () => {
    expect(promptForWritingSkill("Improve clarity")).toMatch(/^Improve clarity:/);
    expect(promptForWritingSkill("Summarize this file" )).toBe("Summarize this file");
    expect(() => buildWritingSkillPrompt("unknown", "text")).toThrow("Unknown Markdown writing skill");
  });
});
