"""Redact sensitive patterns from Git diffs before sending to the frontend."""

import re

_PLACEHOLDER = "[REDACTED]"

# Patterns that match sensitive values; replacement preserves structure for diff readability
_REDACT_PATTERNS: list[tuple[re.Pattern, str]] = [
    # OpenRouter / OpenAI / generic API keys (sk-or-..., sk-...)
    (re.compile(r'\bsk-or-[a-zA-Z0-9_-]{20,}\b'), "sk-or-[REDACTED]"),
    (re.compile(r'\bsk-[a-zA-Z0-9_-]{20,}\b'), "sk-[REDACTED]"),
    # AWS access keys
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), _PLACEHOLDER),
    # Generic "key=value" or "KEY=value" (env-style)
    (re.compile(r'(\b(?:api_key|apikey|secret|password|passwd|token|credential)\s*=\s*["\']?)([^"\'\s]+)(["\']?)', re.I), r"\1[REDACTED]\3"),
    # Connection strings with credentials
    (re.compile(r'(://)([^:@]+):([^@]+)(@)'), r"\1\2:[REDACTED]\4"),
    # Bearer tokens
    (re.compile(r'\bBearer\s+[a-zA-Z0-9_\-\.]+', re.I), "Bearer [REDACTED]"),
    # Generic hex-like tokens (40+ chars, e.g. SHA1/SHA256 hashes used as secrets)
    (re.compile(r'\b[a-fA-F0-9]{40,}\b'), _PLACEHOLDER),
]


def redact_diff(diff: str) -> str:
    """
    Redact sensitive patterns from a Git diff string.
    Returns the redacted diff. Empty input returns empty string.
    """
    if not diff or not isinstance(diff, str):
        return diff if diff else ""
    result = diff
    for pattern, replacement in _REDACT_PATTERNS:
        try:
            result = pattern.sub(replacement, result)
        except re.error:
            continue
    return result
