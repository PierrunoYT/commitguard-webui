// Main DOM elements
const apiKey = document.getElementById("apiKey");
const keyStatus = document.getElementById("keyStatus");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const repoPath = document.getElementById("repoPath");
const model = document.getElementById("model");
const modelDisplay = document.getElementById("modelDisplay");
const modelTrigger = document.getElementById("modelTrigger");
const modelPanel = document.getElementById("modelPanel");
const modelDropdown = document.getElementById("modelDropdown");
const loadModelsBtn = document.getElementById("loadModelsBtn");
const ref = document.getElementById("ref");
const rangeRef = document.getElementById("rangeRef");
const includeDiff = document.getElementById("includeDiff");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeRangeBtn = document.getElementById("analyzeRangeBtn");
const checkBtn = document.getElementById("checkBtn");
const resultTabs = document.getElementById("resultTabs");
const resultPanels = document.getElementById("resultPanels");
const error = document.getElementById("error");

let diffInstances = [];
let nextResultId = 1;

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

function ensureFilename(obj, fallback) {
    if (obj && (obj.filename == null || obj.filename === "" || obj.filename === "/dev/null")) {
        obj.filename = fallback || "file.txt";
    }
}

const EXT_TO_LANG = { py: "python", js: "javascript", ts: "typescript", jsx: "jsx", tsx: "tsx", html: "html", css: "css", json: "json", md: "markdown", yml: "yaml", yaml: "yaml", sh: "shell", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", c: "c", cpp: "cpp", h: "c", hpp: "cpp", php: "php", sql: "sql" };

function langFromFilename(filename) {
    if (!filename || typeof filename !== "string") return "text";
    const ext = filename.split(".").pop()?.toLowerCase();
    return EXT_TO_LANG[ext] || "text";
}

// Diff and Results utilities
function cleanupDiffInstances() {
    diffInstances.forEach((d) => d.cleanUp());
    diffInstances = [];
}

function clearResults() {
    cleanupDiffInstances();
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
    try {
        const { parsePatchFiles, FileDiff, setLanguageOverride } = await import("https://esm.sh/@pierre/diffs");
        const files = parsePatchFiles(diff);
        let renderedFileCount = 0;
        diffContainer.innerHTML = "";
        if (files.length === 0) {
            renderRawDiffFallback(diff, "Could not render visual diff. Showing raw patch text instead.", {
                truncated,
                diffSection,
                diffContainer
            });
            return;
        }
        diffSection.hidden = false;
        if (truncated) {
            addDiffNotice(diffContainer, "Diff output was truncated to keep the UI responsive.", "info");
        }
        for (const file of files) {
            const fallback = file.additionFile?.filename ?? file.deletionFile?.filename ?? file.oldFile?.filename ?? file.newFile?.filename ?? "file.txt";
            ensureFilename(file.oldFile, fallback);
            ensureFilename(file.newFile, fallback);
            ensureFilename(file.additionFile, fallback);
            ensureFilename(file.deletionFile, fallback);
            setLanguageOverride(file, langFromFilename(fallback));
            const wrapper = document.createElement("div");
            wrapper.className = "diff-file-wrapper";
            diffContainer.appendChild(wrapper);
            try {
                const fileDiff = new FileDiff({
                    theme: "dark-plus",
                    themeType: "dark",
                    diffStyle: "unified",
                });
                fileDiff.render({ fileDiff: file, fileContainer: wrapper });
                diffInstances.push(fileDiff);
                renderedFileCount += 1;
            } catch (fileErr) {
                console.warn("Skipping file in diff:", fileErr);
            }
        }
        if (!renderedFileCount) {
            renderRawDiffFallback(diff, "Could not render visual diff. Showing raw patch text instead.", {
                truncated,
                diffSection,
                diffContainer
            });
        }
    } catch (e) {
        console.error("Failed to render diff:", e);
        renderRawDiffFallback(
            diff,
            "Could not render visual diff in this environment. Showing raw patch text instead.",
            { truncated, diffSection, diffContainer }
        );
    }
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
    checkBtn.disabled = loading;
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

async function refreshKeyStatus() {
    try {
        const { configured } = await get("/api/settings/key");
        updateKeyStatus(configured);
    } catch {
        updateKeyStatus(false);
    }
}

function buildRequestBody(extra = {}) {
    return {
        api_key: apiKey.value.trim() || undefined,
        repo_path: repoPath.value.trim() || ".",
        model: model.value,
        include_diff: includeDiff?.checked !== false,
        ...extra,
    };
}

function normalizeTabLabel(label, maxLen = 48) {
    if (!label) return "Result";
    return label.length <= maxLen ? label : `${label.slice(0, maxLen - 1)}...`;
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

refreshKeyStatus();
setModelTooltip();

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
        showError("Enter a commit range first (example: HEAD~5..HEAD).");
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
