// Main DOM elements
const apiKey = document.getElementById("apiKey");
const keyStatus = document.getElementById("keyStatus");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const githubToken = document.getElementById("githubToken");
const githubTokenStatus = document.getElementById("githubTokenStatus");
const saveGithubTokenBtn = document.getElementById("saveGithubTokenBtn");
const clearGithubTokenBtn = document.getElementById("clearGithubTokenBtn");
const repoPath = document.getElementById("repoPath");
const model = document.getElementById("model");
const modelDisplay = document.getElementById("modelDisplay");
const modelTrigger = document.getElementById("modelTrigger");
const modelPanel = document.getElementById("modelPanel");
const modelDropdown = document.getElementById("modelDropdown");
const loadModelsBtn = document.getElementById("loadModelsBtn");
const ref = document.getElementById("ref");
const rangeRef = document.getElementById("rangeRef");
const commitSearch = document.getElementById("commitSearch");
const commitList = document.getElementById("commitList");
const loadCommitsBtn = document.getElementById("loadCommitsBtn");
const selectAllCommitsBtn = document.getElementById("selectAllCommitsBtn");
const clearCommitSelectionBtn = document.getElementById("clearCommitSelectionBtn");
const analyzeSelectedBtn = document.getElementById("analyzeSelectedBtn");
const selectedCommitsInfo = document.getElementById("selectedCommitsInfo");
const includeDiff = document.getElementById("includeDiff");
const maxDiffChars = document.getElementById("maxDiffChars");
const systemPrompt = document.getElementById("systemPrompt");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeRangeBtn = document.getElementById("analyzeRangeBtn");
const checkBtn = document.getElementById("checkBtn");
const resultTabs = document.getElementById("resultTabs");
const resultPanels = document.getElementById("resultPanels");
const error = document.getElementById("error");
const prList = document.getElementById("prList");
const loadPrsBtn = document.getElementById("loadPrsBtn");
const prStateFilter = document.getElementById("prStateFilter");
const prBrowserSection = document.getElementById("prBrowserSection");
const precommitSection = document.getElementById("precommitSection");

let nextResultId = 1;
let commitSearchTimer = null;

// GitHub URL detection
function isGithubUrl(url) {
    if (!url) return false;
    return /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+/.test(url.trim()) ||
        /^git@github\.com:[\w.\-]+\/[\w.\-]+/.test(url.trim());
}

// Update UI visibility based on whether we're looking at a GitHub URL or local repo
function updateRepoModeUi() {
    const isGh = isGithubUrl(repoPath.value.trim());
    if (prBrowserSection) prBrowserSection.style.display = isGh ? "" : "none";
    if (precommitSection) precommitSection.style.display = isGh ? "none" : "";
    if (checkBtn) checkBtn.disabled = isGh;
}

// Utilities
function getModelDisplayName(modelInfo) {
    const name = typeof modelInfo?.name === "string" ? modelInfo.name.trim() : "";
    const id = typeof modelInfo?.id === "string" ? modelInfo.id.trim() : "";
    return name || id;
}

function setModelTooltip() {
    const label = modelDisplay.textContent;
    modelTrigger.title = label;
}

function openModelDropdown() {
    modelDropdown.classList.add("open");
    modelPanel.hidden = false;
    modelTrigger.setAttribute("aria-expanded", "true");
    const opts = modelPanel.querySelectorAll(".custom-dropdown__option");
    opts.forEach((o) => o.classList.remove("highlighted"));
    const selected = modelPanel.querySelector(".custom-dropdown__option.selected");
    if (selected) selected.classList.add("highlighted");
    else if (opts.length) opts[0].classList.add("highlighted");
}

function closeModelDropdown() {
    modelDropdown.classList.remove("open");
    modelPanel.hidden = true;
    modelTrigger.setAttribute("aria-expanded", "false");
    modelPanel.querySelectorAll(".custom-dropdown__option").forEach((o) => o.classList.remove("highlighted"));
}

function selectModel(value, label) {
    model.value = value;
    modelDisplay.textContent = label;
    modelPanel.querySelectorAll(".custom-dropdown__option").forEach((o) => {
        o.classList.toggle("selected", o.getAttribute("data-value") === value);
    });
    setModelTooltip();
    closeModelDropdown();
    model.dispatchEvent(new Event("change", { bubbles: true }));
}

function populateModelSelect(models, preferredId) {
    modelPanel.innerHTML = "";
    for (const m of models) {
        const label = getModelDisplayName(m);
        if (!label) continue;
        const opt = document.createElement("div");
        opt.className = "custom-dropdown__option";
        opt.setAttribute("role", "option");
        opt.setAttribute("data-value", m.id);
        opt.textContent = label;
        opt.title = label;
        opt.addEventListener("click", (e) => {
            e.stopPropagation();
            selectModel(m.id, label);
        });
        modelPanel.appendChild(opt);
    }

    if (preferredId) {
        model.value = preferredId;
        const chosen = modelPanel.querySelector(`[data-value="${CSS.escape(preferredId)}"]`);
        modelDisplay.textContent = chosen ? chosen.textContent : preferredId;
    } else if (models.length) {
        const first = models[0];
        model.value = first.id;
        modelDisplay.textContent = getModelDisplayName(first);
    }
    modelPanel.querySelectorAll(".custom-dropdown__option").forEach((o) => {
        o.classList.toggle("selected", o.getAttribute("data-value") === model.value);
    });
    setModelTooltip();
}

function renderMarkdown(text) {
    if (!text || !text.trim()) return "";
    const raw = marked.parse(text.trim(), { gfm: true, breaks: true });
    const hook = (node) => {
        if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
            node.setAttribute("rel", "noopener noreferrer");
        }
    };
    DOMPurify.addHook("afterSanitizeAttributes", hook);
    try {
        return DOMPurify.sanitize(raw, {
            ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "hr", "a"],
            ALLOWED_ATTR: ["href", "target", "rel"],
            ALLOWED_URI_REGEXP: /^(https?|mailto):/i
        });
    } finally {
        DOMPurify.removeHook("afterSanitizeAttributes");
    }
}

// Diff and Results utilities
function clearResults() {
    resultTabs.innerHTML = "";
    resultTabs.hidden = true;
    resultPanels.innerHTML = "";
}

function addDiffNotice(diffContainer, message, level = "warn") {
    const notice = document.createElement("div");
    notice.className = `diff-notice diff-notice--${level}`;
    notice.textContent = message;
    diffContainer.appendChild(notice);
}

function renderRawDiffFallback(diff, warning, options = {}) {
    const { truncated = false, diffSection, diffContainer } = options;
    diffSection.hidden = false;
    diffContainer.innerHTML = "";
    addDiffNotice(diffContainer, warning, "warn");
    if (truncated) {
        addDiffNotice(diffContainer, "Diff output was truncated to keep the UI responsive.", "info");
    }
    const pre = document.createElement("pre");
    pre.className = "diff-raw-fallback";
    pre.textContent = diff;
    diffContainer.appendChild(pre);
}

async function renderDiff(diff, options = {}) {
    const { truncated = false, diffSection, diffContainer } = options;
    if (!diff || !diff.trim()) {
        diffSection.hidden = true;
        diffContainer.innerHTML = "";
        return;
    }
    renderRawDiffFallback(diff, "Showing raw patch text.", { truncated, diffSection, diffContainer });
}

function activateResult(id) {
    resultTabs.querySelectorAll(".result-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.getAttribute("data-target") === id);
    });
    resultPanels.querySelectorAll(".result-panel").forEach((panel) => {
        panel.hidden = panel.id !== id;
    });
}

function createResultPanel(entry) {
    const panelId = `result-panel-${nextResultId++}`;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "result-tab";
    tab.setAttribute("data-target", panelId);
    tab.textContent = entry.tabLabel || "Result";
    tab.title = entry.tabLabel || "Result";
    tab.addEventListener("click", () => activateResult(panelId));
    resultTabs.appendChild(tab);

    const panel = document.createElement("section");
    panel.className = "result-panel";
    panel.id = panelId;
    panel.hidden = true;

    const title = document.createElement("h4");
    title.className = "result-panel__title";
    title.textContent = entry.title || "Result";
    panel.appendChild(title);

    const resultBox = document.createElement("div");
    resultBox.className = "result-box";
    resultBox.innerHTML = renderMarkdown(entry.result || "");
    panel.appendChild(resultBox);

    const diffSection = document.createElement("div");
    diffSection.className = "diff-section";
    diffSection.hidden = true;

    const diffTitle = document.createElement("h4");
    diffTitle.className = "diff-section__title";
    diffTitle.textContent = "Diff";
    diffSection.appendChild(diffTitle);

    const diffContainer = document.createElement("div");
    diffContainer.className = "diff-container";
    diffSection.appendChild(diffContainer);
    panel.appendChild(diffSection);
    resultPanels.appendChild(panel);

    renderDiff(entry.diff || "", {
        truncated: entry.truncated === true,
        diffSection,
        diffContainer,
    });
}

function showResults(entries) {
    error.textContent = "";
    clearResults();
    if (!entries || !entries.length) return;
    for (const entry of entries) {
        createResultPanel(entry);
    }
    resultTabs.hidden = false;
    const firstTab = resultTabs.querySelector(".result-tab");
    if (firstTab) activateResult(firstTab.getAttribute("data-target"));
}

function showError(msg) {
    clearResults();
    error.textContent = msg;
}

function setLoading(loading, message = "Analyzing...") {
    analyzeBtn.disabled = loading;
    analyzeRangeBtn.disabled = loading;
    checkBtn.disabled = loading || isGithubUrl(repoPath.value.trim());
    if (analyzeSelectedBtn) {
        analyzeSelectedBtn.disabled = loading || getSelectedCommitRefs().length === 0;
    }
    if (loading) {
        error.textContent = "";
        clearResults();
        const panel = document.createElement("section");
        panel.className = "result-panel";
        const title = document.createElement("h4");
        title.className = "result-panel__title";
        title.textContent = message;
        panel.appendChild(title);
        resultPanels.appendChild(panel);
    }
}

async function post(endpoint, body) {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

async function get(endpoint) {
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

function updateKeyStatus(saved) {
    keyStatus.textContent = saved ? "Saved" : "";
    keyStatus.className = "key-status " + (saved ? "saved" : "empty");
}

function updateGithubTokenStatus(saved) {
    githubTokenStatus.textContent = saved ? "Saved" : "";
    githubTokenStatus.className = "key-status " + (saved ? "saved" : "empty");
}

async function refreshKeyStatus() {
    try {
        const { configured } = await get("/api/settings/key");
        updateKeyStatus(configured);
    } catch {
        updateKeyStatus(false);
    }
}

async function refreshGithubTokenStatus() {
    try {
        const { configured } = await get("/api/settings/github-token");
        updateGithubTokenStatus(configured);
    } catch {
        updateGithubTokenStatus(false);
    }
}

function buildRequestBody(extra = {}) {
    const maxDiffRaw = maxDiffChars?.value?.trim() || "";
    let maxDiff = undefined;
    if (maxDiffRaw) {
        const parsed = Number.parseInt(maxDiffRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            maxDiff = parsed;
        }
    }
    return {
        api_key: apiKey.value.trim() || undefined,
        github_token: githubToken.value.trim() || undefined,
        repo_path: repoPath.value.trim() || ".",
        model: model.value,
        include_diff: includeDiff?.checked !== false,
        max_diff_chars: maxDiff,
        system_prompt: systemPrompt?.value ?? undefined,
        ...extra,
    };
}

function normalizeTabLabel(label, maxLen = 48) {
    if (!label) return "Result";
    return label.length <= maxLen ? label : `${label.slice(0, maxLen - 1)}...`;
}

function getSelectedCommitRefs() {
    if (!commitList) return [];
    return [...commitList.querySelectorAll('input[type="checkbox"][data-ref]:checked')]
        .map((box) => box.getAttribute("data-ref"))
        .filter(Boolean);
}

function updateCommitSelectionUi() {
    if (!selectedCommitsInfo) return;
    const count = getSelectedCommitRefs().length;
    selectedCommitsInfo.textContent = count
        ? `${count} commit${count === 1 ? "" : "s"} selected.`
        : "No commits selected.";
    if (analyzeSelectedBtn) analyzeSelectedBtn.disabled = count === 0;
}

function formatCommitDate(dateIso) {
    if (!dateIso) return "";
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
}

function renderCommitList(commits) {
    if (!commitList) return;
    commitList.innerHTML = "";
    if (!commits || !commits.length) {
        const empty = document.createElement("div");
        empty.className = "commit-list-empty";
        empty.textContent = "No commits match your search.";
        commitList.appendChild(empty);
        updateCommitSelectionUi();
        return;
    }

    for (const item of commits) {
        const label = document.createElement("label");
        label.className = "commit-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.setAttribute("data-ref", item.ref || "");
        checkbox.addEventListener("change", updateCommitSelectionUi);
        label.appendChild(checkbox);

        const text = document.createElement("div");
        text.className = "commit-item__text";

        const main = document.createElement("div");
        main.className = "commit-item__main";
        const hash = item.short_ref || (item.ref || "").slice(0, 8) || "commit";
        const title = item.title || "No title";
        const hashNode = document.createElement("span");
        hashNode.className = "commit-item__hash";
        hashNode.textContent = hash;
        main.appendChild(hashNode);
        main.appendChild(document.createTextNode(` ${title}`));
        text.appendChild(main);

        const meta = document.createElement("div");
        meta.className = "commit-item__meta";
        const dateText = formatCommitDate(item.date);
        meta.textContent = [item.author || "Unknown author", dateText].filter(Boolean).join(" - ");
        text.appendChild(meta);

        label.appendChild(text);
        commitList.appendChild(label);
    }
    updateCommitSelectionUi();
}

async function loadCommits(searchText = commitSearch?.value?.trim() || "") {
    if (!loadCommitsBtn || !commitList) return;
    loadCommitsBtn.disabled = true;
    const previousLabel = loadCommitsBtn.textContent;
    loadCommitsBtn.textContent = "Loading...";
    commitList.innerHTML = '<div class="commit-list-empty">Loading commits...</div>';
    try {
        const data = await post("/api/commits", {
            repo_path: repoPath.value.trim() || ".",
            github_token: githubToken.value.trim() || undefined,
            search: searchText || undefined,
            limit: 120,
        });
        renderCommitList(data.commits || []);
        error.textContent = "";
    } catch (e) {
        commitList.innerHTML = `<div class="commit-list-empty">${e.message}</div>`;
    } finally {
        loadCommitsBtn.disabled = false;
        loadCommitsBtn.textContent = previousLabel;
    }
}

// PR Browser
function renderPrList(prs) {
    if (!prList) return;
    prList.innerHTML = "";
    if (!prs || !prs.length) {
        const empty = document.createElement("div");
        empty.className = "commit-list-empty";
        empty.textContent = "No pull requests found.";
        prList.appendChild(empty);
        return;
    }

    for (const pr of prs) {
        const item = document.createElement("div");
        item.className = "pr-item";

        const text = document.createElement("div");
        text.className = "pr-item__text";

        const main = document.createElement("div");
        main.className = "pr-item__main";

        const numSpan = document.createElement("span");
        numSpan.className = "pr-item__number";
        numSpan.textContent = `#${pr.number}`;
        main.appendChild(numSpan);
        main.appendChild(document.createTextNode(` ${pr.title || "Untitled"}`));
        if (pr.draft) {
            const draftSpan = document.createElement("span");
            draftSpan.className = "pr-item__draft";
            draftSpan.textContent = "Draft";
            main.appendChild(draftSpan);
        }
        text.appendChild(main);

        const meta = document.createElement("div");
        meta.className = "pr-item__meta";
        const parts = [];
        if (pr.author) parts.push(`by ${pr.author}`);
        if (pr.base && pr.head) parts.push(`${pr.head} → ${pr.base}`);
        if (pr.updated_at) parts.push(new Date(pr.updated_at).toLocaleDateString());
        meta.textContent = parts.join(" · ");
        text.appendChild(meta);

        item.appendChild(text);

        const analyzeBtn = document.createElement("button");
        analyzeBtn.type = "button";
        analyzeBtn.className = "analyze-pr-btn";
        analyzeBtn.textContent = "Analyze";
        analyzeBtn.addEventListener("click", () => analyzePr(pr.number, pr.title));
        item.appendChild(analyzeBtn);

        prList.appendChild(item);
    }
}

async function loadPrs() {
    if (!loadPrsBtn || !prList) return;
    const repoVal = repoPath.value.trim();
    if (!isGithubUrl(repoVal)) {
        prList.innerHTML = '<div class="commit-list-empty">Enter a GitHub URL in the Repository field.</div>';
        return;
    }
    loadPrsBtn.disabled = true;
    const previousLabel = loadPrsBtn.textContent;
    loadPrsBtn.textContent = "Loading...";
    prList.innerHTML = '<div class="commit-list-empty">Loading pull requests...</div>';
    try {
        const data = await post("/api/github/prs", {
            repo_path: repoVal,
            github_token: githubToken.value.trim() || undefined,
            state: prStateFilter?.value || "open",
            limit: 50,
        });
        renderPrList(data.prs || []);
    } catch (e) {
        prList.innerHTML = `<div class="commit-list-empty">${e.message}</div>`;
    } finally {
        loadPrsBtn.disabled = false;
        loadPrsBtn.textContent = previousLabel;
    }
}

async function analyzePr(prNumber, prTitle) {
    const label = `PR #${prNumber}${prTitle ? `: ${prTitle}` : ""}`;
    setLoading(true, `Analyzing ${label}...`);
    try {
        const data = await post("/api/github/analyze-pr", buildRequestBody({ pr_number: prNumber }));
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
        showError(e.message);
    } finally {
        setLoading(false);
    }
}

function isCommitRange(input) {
    return typeof input === "string" && input.includes("..");
}

function parseCommitRefs(input) {
    return (input || "")
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

async function analyzeRange(range) {
    const data = await post("/api/analyze-range", buildRequestBody({ range, max_commits: 20 }));
    const entries = (data.results || []).map((item) => {
        const label = `${item.short_ref || "commit"} ${item.title || ""}`.trim();
        return {
            tabLabel: normalizeTabLabel(label),
            title: `${item.short_ref || item.ref || "commit"} - ${item.title || "Commit"}`,
            result: item.result || "",
            diff: item.diff || "",
            truncated: item.diff_truncated === true,
        };
    });
    if (!entries.length) {
        throw new Error(`No commits found in range "${range}".`);
    }
    showResults(entries);
}

async function analyzeRefList(refs) {
    const entries = [];
    for (const commitRef of refs) {
        const data = await post("/api/analyze", buildRequestBody({ ref: commitRef }));
        entries.push({
            tabLabel: normalizeTabLabel(commitRef),
            title: `Commit ${commitRef}`,
            result: data.result || "",
            diff: data.diff || "",
            truncated: data.diff_truncated === true,
        });
    }
    showResults(entries);
}

// API key (save/clear)
saveKeyBtn.addEventListener("click", async () => {
    const key = apiKey.value.trim();
    if (!key) {
        showError("Enter your API key first, then click Save.");
        return;
    }
    try {
        await post("/api/settings/key", { api_key: key });
        updateKeyStatus(true);
        apiKey.value = "";
        apiKey.placeholder = "Saved (enter new to override)";
        showResults([]);
    } catch (e) {
        showError(e.message);
    }
});

clearKeyBtn.addEventListener("click", async () => {
    try {
        const res = await fetch("/api/settings/key", { method: "DELETE" });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to clear key");
        }
        updateKeyStatus(false);
        apiKey.placeholder = "sk-or-...";
        showResults([]);
    } catch (e) {
        showError(e.message);
    }
});

// GitHub token (save/clear)
saveGithubTokenBtn.addEventListener("click", async () => {
    const token = githubToken.value.trim();
    if (!token) {
        showError("Enter your GitHub token first, then click Save.");
        return;
    }
    try {
        await post("/api/settings/github-token", { github_token: token });
        updateGithubTokenStatus(true);
        githubToken.value = "";
        githubToken.placeholder = "Saved (enter new to override)";
        showResults([]);
    } catch (e) {
        showError(e.message);
    }
});

clearGithubTokenBtn.addEventListener("click", async () => {
    try {
        const res = await fetch("/api/settings/github-token", { method: "DELETE" });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to clear GitHub token");
        }
        updateGithubTokenStatus(false);
        githubToken.placeholder = "ghp_... or github_pat_...";
        showResults([]);
    } catch (e) {
        showError(e.message);
    }
});

refreshKeyStatus();
refreshGithubTokenStatus();
setModelTooltip();
updateCommitSelectionUi();
updateRepoModeUi();
loadCommits();

// Model Dropdown Events
modelTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (modelDropdown.classList.contains("open")) {
        closeModelDropdown();
    } else {
        openModelDropdown();
    }
});

modelTrigger.addEventListener("keydown", (e) => {
    if (!modelDropdown.classList.contains("open")) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openModelDropdown();
        }
        return;
    }
    const opts = [...modelPanel.querySelectorAll(".custom-dropdown__option")];
    const idx = opts.findIndex((o) => o.classList.contains("highlighted"));
    if (e.key === "Escape") {
        e.preventDefault();
        closeModelDropdown();
        opts.forEach((o) => o.classList.remove("highlighted"));
    } else if (e.key === "ArrowDown" && opts.length) {
        e.preventDefault();
        const next = idx < opts.length - 1 ? idx + 1 : 0;
        opts.forEach((o, i) => o.classList.toggle("highlighted", i === next));
    } else if (e.key === "ArrowUp" && opts.length) {
        e.preventDefault();
        const next = idx <= 0 ? opts.length - 1 : idx - 1;
        opts.forEach((o, i) => o.classList.toggle("highlighted", i === next));
    } else if (e.key === "Enter" && idx >= 0) {
        e.preventDefault();
        const o = opts[idx];
        selectModel(o.getAttribute("data-value"), o.textContent);
        opts.forEach((x) => x.classList.remove("highlighted"));
    }
});

modelPanel.addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("click", () => {
    if (modelDropdown.classList.contains("open")) closeModelDropdown();
});

loadCommitsBtn && loadCommitsBtn.addEventListener("click", () => {
    loadCommits();
});

commitSearch && commitSearch.addEventListener("input", () => {
    if (commitSearchTimer) {
        clearTimeout(commitSearchTimer);
    }
    commitSearchTimer = setTimeout(() => {
        loadCommits(commitSearch.value.trim());
    }, 250);
});

commitSearch && commitSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        loadCommits(commitSearch.value.trim());
    }
});

repoPath.addEventListener("change", () => {
    updateRepoModeUi();
    loadCommits(commitSearch?.value?.trim() || "");
    if (prList) prList.innerHTML = "";
});

repoPath.addEventListener("input", () => {
    updateRepoModeUi();
});

selectAllCommitsBtn && selectAllCommitsBtn.addEventListener("click", () => {
    if (!commitList) return;
    commitList.querySelectorAll('input[type="checkbox"][data-ref]').forEach((box) => {
        box.checked = true;
    });
    updateCommitSelectionUi();
});

clearCommitSelectionBtn && clearCommitSelectionBtn.addEventListener("click", () => {
    if (!commitList) return;
    commitList.querySelectorAll('input[type="checkbox"][data-ref]').forEach((box) => {
        box.checked = false;
    });
    updateCommitSelectionUi();
});

analyzeSelectedBtn && analyzeSelectedBtn.addEventListener("click", async () => {
    const refs = getSelectedCommitRefs();
    if (!refs.length) {
        showError("Select one or more commits first.");
        return;
    }
    ref.value = refs.join(",");
    setLoading(true, `Analyzing ${refs.length} selected commit${refs.length === 1 ? "" : "s"}...`);
    try {
        await analyzeRefList(refs);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});

// PR Browser events
loadPrsBtn && loadPrsBtn.addEventListener("click", () => {
    loadPrs();
});

prStateFilter && prStateFilter.addEventListener("change", () => {
    if (prList && prList.children.length > 0 && !prList.querySelector(".commit-list-empty")) {
        loadPrs();
    }
});

// Load Models Button
loadModelsBtn.addEventListener("click", async () => {
    const key = apiKey.value.trim();
    loadModelsBtn.disabled = true;
    loadModelsBtn.textContent = "Loading...";
    try {
        const { models } = await post("/api/models", { api_key: key || undefined });
        const current = model.value;
        const unique = new Map();
        for (const m of models) {
            if (!m?.id || unique.has(m.id)) continue;
            unique.set(m.id, m);
        }
        const sorted = [...unique.values()].sort((a, b) =>
            getModelDisplayName(a).localeCompare(getModelDisplayName(b), undefined, { sensitivity: "base" })
        );
        if (!sorted.length) {
            throw new Error("No models returned by OpenRouter.");
        }
        populateModelSelect(sorted, current);
        showResults([]);
    } catch (e) {
        showError(e.message);
    } finally {
        loadModelsBtn.disabled = false;
        loadModelsBtn.textContent = "Load models";
    }
});

// Analyze commit
analyzeBtn.addEventListener("click", async () => {
    const rawInput = ref.value.trim() || "HEAD";
    const refs = parseCommitRefs(rawInput);
    const hasMultipleRefs = refs.length > 1;
    const rangeFromMainInput = hasMultipleRefs ? "" : refs[0];
    const shouldAnalyzeRange = isCommitRange(rangeFromMainInput);
    const loadingMessage = shouldAnalyzeRange
        ? "Analyzing commit range..."
        : hasMultipleRefs
            ? `Analyzing ${refs.length} commits...`
            : "Analyzing commit...";

    setLoading(true, loadingMessage);
    try {
        if (shouldAnalyzeRange) {
            await analyzeRange(rangeFromMainInput);
        } else if (hasMultipleRefs) {
            await analyzeRefList(refs);
        } else {
            await analyzeRefList([rangeFromMainInput || "HEAD"]);
        }
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});

// Analyze range
analyzeRangeBtn && analyzeRangeBtn.addEventListener("click", async () => {
    if (!rangeRef) return;
    const range = rangeRef.value.trim();
    if (!range) {
        showError("Enter a commit range first (example: HEAD~5..HEAD or main..feature-branch).");
        return;
    }
    setLoading(true, "Analyzing commit range...");
    try {
        await analyzeRange(range);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});

// Analyze staged changes
checkBtn.addEventListener("click", async () => {
    if (isGithubUrl(repoPath.value.trim())) {
        showError("Pre-commit check is only available for local repositories.");
        return;
    }
    setLoading(true, "Analyzing staged changes...");
    try {
        const data = await post("/api/check", buildRequestBody());
        showResults([
            {
                tabLabel: "Staged changes",
                title: "Staged changes",
                result: data.result,
                diff: data.diff,
                truncated: data.diff_truncated === true,
            }
        ]);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});
