"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api } from "@/lib/api";

const DEFAULT_MAX_DIFF_CHARS = 50000;
const MAX_MAX_DIFF_CHARS = 200000;
const DEFAULT_SYSTEM_PROMPT = `You are a code review assistant. Analyze Git commits for:
1. Potential bugs and logic errors
2. Security vulnerabilities
3. Code quality issues
4. Missing error handling or validation
5. Performance concerns

Respond in markdown. Be concise. If nothing concerning is found, say "No issues detected."
`;

function isGithubUrl(url: string): boolean {
  if (!url) return false;
  return (
    /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+/.test(url.trim()) ||
    /^git@github\.com:[\w.\-]+\/[\w.\-]+/.test(url.trim())
  );
}

function getModelDisplayName(model: { name?: string; id?: string }): string {
  const name = typeof model?.name === "string" ? model.name.trim() : "";
  const id = typeof model?.id === "string" ? model.id.trim() : "";
  return name || id;
}

function renderMarkdown(text: string): string {
  if (!text?.trim()) return "";
  const raw = marked.parse(text.trim(), { gfm: true, breaks: true }) as string;
  const hook = (node: Element) => {
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  };
  DOMPurify.addHook("afterSanitizeAttributes", hook);
  try {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "hr", "a"],
      ALLOWED_ATTR: ["href", "target", "rel"],
      ALLOWED_URI_REGEXP: /^(https?|mailto):/i,
    });
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
}

function normalizeTabLabel(label: string, maxLen = 48): string {
  if (!label) return "Result";
  return label.length <= maxLen ? label : `${label.slice(0, maxLen - 1)}...`;
}

function formatCommitDate(dateIso: string): string {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function isCommitRange(input: string): boolean {
  return typeof input === "string" && input.includes("..");
}

function parseCommitRefs(input: string): string[] {
  return (input || "")
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface ResultEntry {
  id: string;
  tabLabel: string;
  title: string;
  result: string;
  diff: string;
  truncated?: boolean;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubTokenSaved, setGithubTokenSaved] = useState(false);
  const [repoPath, setRepoPath] = useState("..");
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [modelDisplay, setModelDisplay] = useState("GPT-4o Mini (default)");
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [ref, setRef] = useState("HEAD");
  const [rangeRef, setRangeRef] = useState("");
  const [commitSearch, setCommitSearch] = useState("");
  const [commits, setCommits] = useState<Array<{ ref: string; short_ref: string; title: string; author: string; date: string }>>([]);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [includeDiff, setIncludeDiff] = useState(true);
  const [maxDiffChars, setMaxDiffChars] = useState(String(DEFAULT_MAX_DIFF_CHARS));
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Analyzing...");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [prs, setPrs] = useState<Array<{ number: number; title: string; author: string; draft: boolean; base: string; head: string; updated_at: string }>>([]);
  const [prStateFilter, setPrStateFilter] = useState("open");
  const [configExpanded, setConfigExpanded] = useState(false);
  const nextResultId = useRef(0);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownOpen && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
        setModelSearch("");
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [modelDropdownOpen]);

  const filteredModels = models.length === 0 ? [] : models.filter((m) => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return true;
    const id = (m.id || "").toLowerCase();
    const name = (m.name || "").toLowerCase();
    return id.includes(q) || name.includes(q);
  });

  const isGh = isGithubUrl(repoPath);

  const getRequestBody = useCallback(
    (extra: Record<string, unknown> = {}) => {
      let maxDiff: number | undefined;
      const raw = maxDiffChars?.trim() || "";
      if (raw) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          maxDiff = Math.min(parsed, MAX_MAX_DIFF_CHARS);
        }
      }
      return {
        api_key: apiKey.trim() || undefined,
        github_token: githubToken.trim() || undefined,
        repo_path: repoPath.trim() || ".",
        model,
        include_diff: includeDiff,
        max_diff_chars: maxDiff,
        system_prompt: systemPrompt || undefined,
        ...extra,
      };
    },
    [apiKey, githubToken, repoPath, model, includeDiff, maxDiffChars, systemPrompt]
  );

  const refreshKeyStatus = useCallback(async () => {
    try {
      const { configured } = await api.settingsKey.get();
      setKeySaved(configured);
    } catch {
      setKeySaved(false);
    }
  }, []);

  const refreshGithubTokenStatus = useCallback(async () => {
    try {
      const { configured } = await api.settingsGithubToken.get();
      setGithubTokenSaved(configured);
    } catch {
      setGithubTokenSaved(false);
    }
  }, []);

  useEffect(() => {
    refreshKeyStatus();
    refreshGithubTokenStatus();
  }, [refreshKeyStatus, refreshGithubTokenStatus]);

  const loadCommits = useCallback(async () => {
    try {
      const data = await api.commits({
        repo_path: repoPath.trim() || ".",
        github_token: githubToken.trim() || undefined,
        search: commitSearch.trim() || undefined,
        limit: 120,
      });
      setCommits(data.commits || []);
      setError("");
    } catch (e) {
      setCommits([]);
      setError(e instanceof Error ? e.message : "Failed to load commits");
    }
  }, [repoPath, githubToken, commitSearch]);

  useEffect(() => {
    const t = setTimeout(() => loadCommits(), 250);
    return () => clearTimeout(t);
  }, [commitSearch, repoPath, githubToken, loadCommits]);

  const loadPrs = useCallback(async () => {
    if (!isGithubUrl(repoPath.trim())) return;
    try {
      const data = await api.prs({
        repo_path: repoPath.trim(),
        github_token: githubToken.trim() || undefined,
        state: prStateFilter,
        limit: 50,
      });
      setPrs(data.prs || []);
    } catch (e) {
      setPrs([]);
      setError(e instanceof Error ? e.message : "Failed to load PRs");
    }
  }, [repoPath, githubToken, prStateFilter]);

  const setLoadingState = useCallback((loading: boolean, message = "Analyzing...") => {
    setLoading(loading);
    setLoadingMessage(message);
    if (loading) {
      setError("");
      setResults([]);
    }
  }, []);

  const showResults = useCallback((entries: Omit<ResultEntry, "id">[]) => {
    const withIds = entries.map((e) => ({
      ...e,
      id: `result-panel-${++nextResultId.current}`,
    }));
    setError("");
    setResults(withIds);
    if (withIds.length) setActiveResultId(withIds[0].id);
  }, []);

  const showError = useCallback((msg: string) => {
    setResults([]);
    setError(msg);
  }, []);

  const showSafeError = useCallback(
    (fallback: string, e: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.error(fallback, e);
      }
      showError(fallback);
    },
    [showError]
  );

  const analyzeRange = useCallback(
    async (range: string) => {
      const data = await api.analyzeRange(
        getRequestBody({ range, max_commits: 20 })
      );
      const entries: ResultEntry[] = (data.results || []).map((item) => {
        const label = `${item.short_ref || "commit"} ${item.title || ""}`.trim();
        return {
          tabLabel: normalizeTabLabel(label),
          title: `${item.short_ref || item.ref || "commit"} - ${item.title || "Commit"}`,
          result: item.result || "",
          diff: item.diff || "",
          truncated: item.diff_truncated === true,
        };
      });
      if (!entries.length) throw new Error(`No commits found in range "${range}".`);
      showResults(entries);
    },
    [getRequestBody, showResults]
  );

  const analyzeRefList = useCallback(
    async (refs: string[]) => {
      const entries: ResultEntry[] = [];
      for (const commitRef of refs) {
        const data = await api.analyze(getRequestBody({ ref: commitRef }));
        entries.push({
          tabLabel: normalizeTabLabel(commitRef),
          title: `Commit ${commitRef}`,
          result: data.result || "",
          diff: data.diff || "",
          truncated: data.diff_truncated === true,
        });
      }
      showResults(entries);
    },
    [getRequestBody, showResults]
  );

  const handleAnalyze = useCallback(async () => {
    const rawInput = ref.trim() || "HEAD";
    const refs = parseCommitRefs(rawInput);
    const hasMultipleRefs = refs.length > 1;
    const rangeFromMainInput = hasMultipleRefs ? "" : refs[0];
    const shouldAnalyzeRange = isCommitRange(rangeFromMainInput);
    const loadingMessage = shouldAnalyzeRange
      ? "Analyzing commit range..."
      : hasMultipleRefs
        ? `Analyzing ${refs.length} commits...`
        : "Analyzing commit...";

    setLoadingState(true, loadingMessage);
    try {
      if (shouldAnalyzeRange) {
        await analyzeRange(rangeFromMainInput);
      } else if (hasMultipleRefs) {
        await analyzeRefList(refs);
      } else {
        await analyzeRefList([rangeFromMainInput || "HEAD"]);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingState(false);
    }
  }, [ref, analyzeRange, analyzeRefList, setLoadingState, showError]);

  const handleAnalyzeRange = useCallback(async () => {
    const range = rangeRef.trim();
    if (!range) {
      showError("Enter a commit range first (example: HEAD~5..HEAD or main..feature-branch).");
      return;
    }
    setLoadingState(true, "Analyzing commit range...");
    try {
      await analyzeRange(range);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingState(false);
    }
  }, [rangeRef, analyzeRange, setLoadingState, showError]);

  const handleAnalyzeSelected = useCallback(async () => {
    const refs = Array.from(selectedRefs);
    if (!refs.length) {
      showError("Select one or more commits first.");
      return;
    }
    setRef(refs.join(","));
    setLoadingState(true, `Analyzing ${refs.length} selected commit${refs.length === 1 ? "" : "s"}...`);
    try {
      await analyzeRefList(refs);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingState(false);
    }
  }, [selectedRefs, analyzeRefList, setLoadingState, showError]);

  const handleAnalyzePr = useCallback(
    async (prNumber: number, prTitle: string) => {
      const label = `PR #${prNumber}${prTitle ? `: ${prTitle}` : ""}`;
      setLoadingState(true, `Analyzing ${label}...`);
      try {
        const data = await api.analyzePr(
          getRequestBody({ pr_number: prNumber })
        );
        const tabLabel = normalizeTabLabel(`PR #${data.pr_number} ${data.pr_title || ""}`.trim());
        showResults([
          {
            tabLabel,
            title: `PR #${data.pr_number}: ${data.pr_title || "Pull Request"}`,
            result: data.result || "",
            diff: data.diff || "",
            truncated: data.diff_truncated === true,
          },
        ]);
      } catch (e) {
        showError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setLoadingState(false);
      }
    },
    [getRequestBody, setLoadingState, showError, showResults]
  );

  const handleCheckStaged = useCallback(async () => {
    if (isGithubUrl(repoPath.trim())) {
      showError("Pre-commit check is only available for local repositories.");
      return;
    }
    setLoadingState(true, "Analyzing staged changes...");
    try {
      const data = await api.check(getRequestBody());
      showResults([
        {
          tabLabel: "Staged changes",
          title: "Staged changes",
          result: data.result,
          diff: data.diff,
          truncated: data.diff_truncated === true,
        },
      ]);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingState(false);
    }
  }, [repoPath, getRequestBody, setLoadingState, showError, showResults]);

  const handleLoadModels = useCallback(async () => {
    try {
      const { models: m } = await api.models({ api_key: apiKey.trim() || undefined });
      const unique = new Map<string, { id: string; name?: string }>();
      for (const model of m || []) {
        if (!model?.id || unique.has(model.id)) continue;
        unique.set(model.id, model);
      }
      const sorted = [...unique.values()].sort((a, b) =>
        getModelDisplayName(a).localeCompare(getModelDisplayName(b), undefined, { sensitivity: "base" })
      );
      if (!sorted.length) throw new Error("No models returned by OpenRouter.");
      setModels(sorted);
      if (sorted.length && !sorted.some((x) => x.id === model)) {
        setModel(sorted[0].id);
        setModelDisplay(getModelDisplayName(sorted[0]));
      }
      setResults([]);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load models");
    }
  }, [apiKey, model, showError]);

  const toggleSelectedRef = (r: string) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const selectAllCommits = () => setSelectedRefs(new Set(commits.map((c) => c.ref)));
  const clearCommitSelection = () => setSelectedRefs(new Set());

  const handleSaveApiKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      showError("Enter API key first.");
      return;
    }
    try {
      await api.settingsKey.save({ api_key: key });
      setKeySaved(true);
      setApiKey("");
      setResults([]);
    } catch (e) {
      showSafeError("Failed to save API key.", e);
    }
  }, [apiKey, showError, showSafeError]);

  const handleClearApiKey = useCallback(async () => {
    try {
      await api.settingsKey.clear();
      setKeySaved(false);
      setApiKey("");
      setResults([]);
    } catch (e) {
      showSafeError("Failed to clear API key.", e);
    }
  }, [showSafeError]);

  const handleSaveGithubToken = useCallback(async () => {
    const token = githubToken.trim();
    if (!token) {
      showError("Enter token first.");
      return;
    }
    try {
      await api.settingsGithubToken.save({ github_token: token });
      setGithubTokenSaved(true);
      setGithubToken("");
      setResults([]);
    } catch (e) {
      showSafeError("Failed to save GitHub token.", e);
    }
  }, [githubToken, showError, showSafeError]);

  const handleClearGithubToken = useCallback(async () => {
    try {
      await api.settingsGithubToken.clear();
      setGithubTokenSaved(false);
      setGithubToken("");
      setResults([]);
    } catch (e) {
      showSafeError("Failed to clear GitHub token.", e);
    }
  }, [showSafeError]);

  const handleMaxDiffCharsChange = useCallback((value: string) => {
    const raw = value.trim();
    if (!raw) {
      setMaxDiffChars("");
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 1), MAX_MAX_DIFF_CHARS);
    setMaxDiffChars(String(clamped));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>CommitGuard</h1>
        <div className="config-bar">
          <div className="config-bar__group">
            <label htmlFor="apiKey">API Key</label>
            <div className="config-bar__input-row">
              <input
                type="password"
                id="apiKey"
                placeholder="sk-or-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <span className={`key-status ${keySaved ? "saved" : "empty"}`} role="status" aria-live="polite">
                <span aria-hidden>{keySaved ? "✓" : "○"}</span>
                <span className="sr-only">{keySaved ? "API key saved" : "API key not saved"}</span>
              </span>
              <button type="button" className="secondary compact" onClick={handleSaveApiKey}>Save</button>
              <button type="button" className="secondary compact" onClick={handleClearApiKey}>Clear</button>
            </div>
            <p className="hint">Leave empty to use the saved key from your user config directory.</p>
          </div>
          <div className="config-bar__group">
            <label htmlFor="githubToken">GitHub</label>
            <div className="config-bar__input-row">
              <input type="password" id="githubToken" placeholder="ghp_..." value={githubToken} onChange={(e) => setGithubToken(e.target.value)} />
              <span className={`key-status ${githubTokenSaved ? "saved" : "empty"}`} role="status" aria-live="polite">
                <span aria-hidden>{githubTokenSaved ? "✓" : "○"}</span>
                <span className="sr-only">{githubTokenSaved ? "GitHub token saved" : "GitHub token not saved"}</span>
              </span>
              <button type="button" className="secondary compact" onClick={handleSaveGithubToken}>Save</button>
              <button type="button" className="secondary compact" onClick={handleClearGithubToken}>Clear</button>
            </div>
            <p className="hint">Used for GitHub repo and PR metadata calls when needed.</p>
          </div>
          <div className="config-bar__group config-bar__group--repo">
            <label htmlFor="repoPath">Repository</label>
            <input type="text" id="repoPath" placeholder=". or github.com/owner/repo" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
          </div>
          <div className="config-bar__group config-bar__group--model">
            <label htmlFor="model">Model</label>
            <div className="config-bar__model-row">
              <div ref={modelDropdownRef} className={`custom-dropdown ${modelDropdownOpen ? "open" : ""}`}>
                <button type="button" className="custom-dropdown__trigger" onClick={() => setModelDropdownOpen(!modelDropdownOpen)}>
                  <span className="custom-dropdown__value">{modelDisplay}</span>
                  <span className="custom-dropdown__arrow" aria-hidden>▼</span>
                </button>
                <div className="custom-dropdown__panel" hidden={!modelDropdownOpen} role="listbox">
                  {models.length > 0 && (
                    <div className="custom-dropdown__search">
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {models.length === 0 ? (
                    <div className="custom-dropdown__option selected" data-value="openai/gpt-4o-mini">GPT-4o Mini (default)</div>
                  ) : filteredModels.length === 0 ? (
                    <div className="custom-dropdown__option custom-dropdown__option--empty">No models match &quot;{modelSearch}&quot;</div>
                  ) : (
                    filteredModels.map((m) => (
                      <div key={m.id} className={`custom-dropdown__option ${model === m.id ? "selected" : ""}`} data-value={m.id} role="option" onClick={() => { setModel(m.id); setModelDisplay(getModelDisplayName(m)); setModelDropdownOpen(false); setModelSearch(""); }}>{getModelDisplayName(m)}</div>
                    ))
                  )}
                </div>
              </div>
              <button type="button" className="secondary compact" onClick={handleLoadModels}>Load</button>
            </div>
          </div>
          <button type="button" className={`config-expand-btn ${configExpanded ? "expanded" : ""}`} onClick={() => setConfigExpanded(!configExpanded)}>
            {configExpanded ? "▲ Advanced" : "▼ Advanced"}
          </button>
        </div>
        {configExpanded && (
          <div className="config-advanced">
            <label className="checkbox-label"><input type="checkbox" checked={includeDiff} onChange={(e) => setIncludeDiff(e.target.checked)} />Include diff</label>
            <div className="config-advanced__field"><label htmlFor="maxDiffChars">Max diff chars</label><input type="number" id="maxDiffChars" min={1} max={MAX_MAX_DIFF_CHARS} value={maxDiffChars} onChange={(e) => handleMaxDiffCharsChange(e.target.value)} placeholder={String(DEFAULT_MAX_DIFF_CHARS)} /></div>
            <div className="config-advanced__field config-advanced__prompt"><label htmlFor="systemPrompt">System prompt</label><textarea id="systemPrompt" rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} /></div>
          </div>
        )}
      </header>

      <main className="app-layout">
        <aside className="control-column">
          <section className="panel actions compact-panel">
            <div className="actions-inner">
            <div className="action-group">
              <h3>Analyze Commit</h3>
              <div className="field">
                <label htmlFor="ref">Commit Ref</label>
                <input
                  type="text"
                  id="ref"
                  placeholder="HEAD"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="rangeRef">Commit Range</label>
                <input
                  type="text"
                  id="rangeRef"
                  placeholder="HEAD~5..HEAD (local) or main..feature-branch (GitHub)"
                  value={rangeRef}
                  onChange={(e) => setRangeRef(e.target.value)}
                />
              </div>
              <div className="button-row">
                <button onClick={handleAnalyze} disabled={loading}>
                  Analyze commit
                </button>
                <button type="button" className="secondary" onClick={handleAnalyzeRange} disabled={loading}>
                  Analyze range
                </button>
              </div>
            </div>

            <div className="action-group">
              <h3>Commit Browser</h3>
              <div className="field commit-picker">
                <label htmlFor="commitSearch">Recent Commits</label>
                <div className="commit-search-row">
                  <input
                    type="text"
                    id="commitSearch"
                    placeholder="Search by message, hash, or author"
                    value={commitSearch}
                    onChange={(e) => setCommitSearch(e.target.value)}
                  />
                  <button type="button" className="secondary" onClick={loadCommits}>
                    Refresh
                  </button>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={selectAllCommits}>
                    Select all shown
                  </button>
                  <button type="button" className="secondary" onClick={clearCommitSelection}>
                    Clear selection
                  </button>
                  <button
                    onClick={handleAnalyzeSelected}
                    disabled={loading || selectedRefs.size === 0}
                  >
                    Analyze selected
                  </button>
                </div>
                <p className="hint" id="selectedCommitsInfo">
                  {selectedRefs.size
                    ? `${selectedRefs.size} commit${selectedRefs.size === 1 ? "" : "s"} selected.`
                    : "No commits selected."}
                </p>
                <div className="commit-list" role="listbox">
                  {commits.length === 0 ? (
                    <div className="commit-list-empty">
                      {error && commits.length === 0 ? error : "No commits match your search."}
                    </div>
                  ) : (
                    commits.map((item) => (
                      <label key={item.ref} className="commit-item">
                        <input
                          type="checkbox"
                          data-ref={item.ref}
                          checked={selectedRefs.has(item.ref)}
                          onChange={() => toggleSelectedRef(item.ref)}
                        />
                        <div className="commit-item__text">
                          <div className="commit-item__main">
                            <span className="commit-item__hash">{item.short_ref || item.ref?.slice(0, 8)}</span>{" "}
                            {item.title || "No title"}
                          </div>
                          <div className="commit-item__meta">
                            {[item.author || "Unknown author", formatCommitDate(item.date)].filter(Boolean).join(" - ")}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            {isGh && (
              <div className="action-group">
                <h3>Pull Request Browser <span className="github-badge">GitHub</span></h3>
                <div className="field">
                  <div className="pr-controls-row">
                    <select
                      className="secondary"
                      value={prStateFilter}
                      onChange={(e) => setPrStateFilter(e.target.value)}
                    >
                      <option value="open">Open PRs</option>
                      <option value="closed">Closed PRs</option>
                      <option value="all">All PRs</option>
                    </select>
                    <button type="button" className="secondary" onClick={loadPrs}>
                      Load PRs
                    </button>
                  </div>
                  <div className="commit-list" role="listbox">
                    {prs.length === 0 ? (
                      <div className="commit-list-empty">Enter a GitHub URL and click Load PRs.</div>
                    ) : (
                      prs.map((pr) => (
                        <div key={pr.number} className="pr-item">
                          <div className="pr-item__text">
                            <div className="pr-item__main">
                              <span className="pr-item__number">#{pr.number}</span> {pr.title || "Untitled"}
                              {pr.draft && <span className="pr-item__draft">Draft</span>}
                            </div>
                            <div className="pr-item__meta">
                              {[pr.author && `by ${pr.author}`, pr.base && pr.head && `${pr.head} → ${pr.base}`, pr.updated_at && new Date(pr.updated_at).toLocaleDateString()]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="analyze-pr-btn"
                            onClick={() => handleAnalyzePr(pr.number, pr.title)}
                          >
                            Analyze
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isGh && (
              <div className="action-group">
                <h3>Pre-commit Check</h3>
                <p className="hint">Analyze staged changes before committing</p>
                <button onClick={handleCheckStaged} disabled={loading}>
                  Check Staged
                </button>
              </div>
            )}
            </div>
          </section>
        </aside>

        <section className="panel output">
          <div className="output-header">
            <h3>Results</h3>
          </div>
          <div className="output-body">
            {loading && (
              <section className="result-panel">
                <h4 className="result-panel__title">{loadingMessage}</h4>
              </section>
            )}
            {results.length > 0 && !loading && (
              <>
                <div className="result-tabs">
                  {results.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`result-tab ${activeResultId === entry.id ? "active" : ""}`}
                      data-target={entry.id}
                      onClick={() => setActiveResultId(entry.id)}
                    >
                      {entry.tabLabel}
                    </button>
                  ))}
                </div>
                <div className="result-panels">
                  {results.map((entry) => (
                    <section
                      key={entry.id}
                      className="result-panel"
                      id={entry.id}
                      hidden={activeResultId !== entry.id}
                    >
                      <h4 className="result-panel__title">{entry.title}</h4>
                      <div
                        className="result-box"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.result) }}
                      />
                      {entry.diff && (
                        <div className="diff-section">
                          <h4 className="diff-section__title">Diff</h4>
                          <div className="diff-container">
                            <div className="diff-notice diff-notice--warn">Showing raw patch text.</div>
                            {entry.truncated && (
                              <div className="diff-notice diff-notice--info">
                                Diff output was truncated to keep the UI responsive.
                              </div>
                            )}
                            <pre className="diff-raw-fallback">{entry.diff}</pre>
                          </div>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </>
            )}
            {!loading && results.length === 0 && !error && (
              <div className="result-panels-empty">
                Run an analysis to see results...
              </div>
            )}
          </div>
          {error && (
            <div className="error-box">{error}</div>
          )}
        </section>
      </main>
    </div>
  );
}
