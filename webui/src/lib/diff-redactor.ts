const PLACEHOLDER = "[REDACTED]";

const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-or-[a-zA-Z0-9_-]{20,}\b/g, "sk-or-[REDACTED]"],
  [/\bsk-[a-zA-Z0-9_-]{20,}\b/g, "sk-[REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, PLACEHOLDER],
  [/(\b(?:api_key|apikey|secret|password|passwd|token|credential)\s*=\s*["']?)([^"'\s]+)(["']?)/gi, "$1[REDACTED]$3"],
  [/(:\/\/)([^:@]+):([^@]+)(@)/g, "$1$2:[REDACTED]$4"],
  [/\bBearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]"],
  [/\b[a-fA-F0-9]{40,}\b/g, PLACEHOLDER],
];

export function redactDiff(diff: string): string {
  if (!diff || typeof diff !== "string") return diff || "";
  let result = diff;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    try {
      result = result.replace(pattern, replacement);
    } catch {
      // skip invalid patterns
    }
  }
  return result;
}
