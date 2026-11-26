export type MarkdownWritingSkill = {
  label: string;
  instruction: string;
};

/** Small, provider-neutral writing actions shared by the assistant UI. */
export const markdownWritingSkills: MarkdownWritingSkill[] = [
  {
    label: "Improve clarity",
    instruction:
      "Rewrite the relevant Markdown for clarity and flow. Preserve meaning, facts, links, and Markdown structure. Return only the revised text.",
  },
  {
    label: "Continue draft",
    instruction:
      "Continue the current Markdown draft from its ending. Match its tone and structure, avoid repeating existing content, and do not invent facts. Return only the new continuation.",
  },
  {
    label: "Create an outline",
    instruction:
      "Create a concise, useful Markdown outline for the current topic and audience. Use nested headings or bullets where appropriate, and do not invent supporting facts.",
  },
  {
    label: "Proofread",
    instruction:
      "Proofread the relevant Markdown for spelling, grammar, and consistency. Preserve the author's meaning and formatting. Return the corrected text, then list any substantive questions separately.",
  },
  {
    label: "Summarize",
    instruction:
      "Summarize the relevant Markdown in a short, accurate set of bullets. Keep key caveats and do not add information that is not present.",
  },
];

export function promptForWritingSkill(label: string): string {
  const skill = markdownWritingSkills.find((entry) => entry.label === label);
  return skill ? `${skill.label}: ${skill.instruction}` : label;
}
