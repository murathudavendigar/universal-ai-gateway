export interface ModerationResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
}

interface PatternRule {
  pattern: RegExp;
  reason: string;
}

// High-confidence patterns: reject outright, never forwarded downstream.
const BLOCK_PATTERNS: PatternRule[] = [
  {
    pattern: /ignore\s+(all|any|previous|prior|above)\s+instructions/i,
    reason: "prompt_injection_ignore_instructions",
  },
  {
    pattern: /disregard\s+(all|any|previous|prior|above)\s+(instructions|rules|system prompt)/i,
    reason: "prompt_injection_disregard_instructions",
  },
  {
    pattern: /(reveal|print|show)\s+(your\s+)?(system prompt|hidden prompt|instructions)/i,
    reason: "system_prompt_exfiltration",
  },
  {
    pattern: /(api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token)\s*[:=]\s*[\w-]{16,}/i,
    reason: "credential_leak_pattern",
  },
  {
    pattern: /-----BEGIN( RSA)? PRIVATE KEY-----/i,
    reason: "private_key_leak",
  },
];

// Lower-confidence patterns: log for audit, but still forward downstream.
const LOG_PATTERNS: PatternRule[] = [
  {
    pattern: /you are now\s+(DAN|in developer mode|unrestricted)/i,
    reason: "jailbreak_attempt",
  },
  {
    pattern: /pretend\s+(you have no|there are no)\s+(rules|restrictions|guidelines)/i,
    reason: "jailbreak_attempt",
  },
];

/**
 * Gateway-level screen applied before any prompt reaches a downstream
 * provider. This is a defense-in-depth layer, not a replacement for the
 * downstream model's own alignment — heuristic, not exhaustive.
 */
export function screenPrompt(prompt: string): ModerationResult {
  for (const { pattern, reason } of BLOCK_PATTERNS) {
    if (pattern.test(prompt)) {
      console.warn(`[UAG Moderation] Blocked request. reason=${reason}`);
      return { allowed: false, flagged: true, reason };
    }
  }

  for (const { pattern, reason } of LOG_PATTERNS) {
    if (pattern.test(prompt)) {
      console.warn(`[UAG Moderation] Flagged suspicious request. reason=${reason}`);
      return { allowed: true, flagged: true, reason };
    }
  }

  return { allowed: true, flagged: false };
}
