export type PromptTemplate = {
  id: string;
  label: string;
  intent: "chat" | "coding" | "reasoning" | "documentation" | "review";
  prompt: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "explain",
    label: "Explain code",
    intent: "chat",
    prompt:
      "Explain the following code clearly for a mid-level engineer. Cover purpose, control flow, and edge cases.\n\n```\n// paste code here\n```",
  },
  {
    id: "refactor",
    label: "Refactor",
    intent: "coding",
    prompt:
      "Refactor the following code for clarity and maintainability. Keep behavior identical. Return only the updated code with a short bullet list of changes.\n\n```\n// paste code here\n```",
  },
  {
    id: "tests",
    label: "Write tests",
    intent: "coding",
    prompt:
      "Write focused unit tests for the following code. Prefer the project's existing test style if obvious; otherwise use vitest. Cover happy path and 2 edge cases.\n\n```\n// paste code here\n```",
  },
  {
    id: "review",
    label: "PR review",
    intent: "review",
    prompt:
      "Review this diff like a careful senior engineer. List bugs, risks, and missing tests. Be specific and prioritize by severity.\n\n```diff\n// paste diff here\n```",
  },
  {
    id: "debug",
    label: "Debug",
    intent: "reasoning",
    prompt:
      "Help me debug this issue. Identify the most likely root causes, what evidence supports each, and the next debugging step.\n\nSymptom:\n\nExpected:\n\nRelevant code/logs:\n",
  },
  {
    id: "docs",
    label: "Write docs",
    intent: "documentation",
    prompt:
      "Write concise documentation for the following feature: purpose, how to use it, env vars, and common pitfalls.\n\nFeature notes:\n",
  },
];
