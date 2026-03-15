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
const analyzeBtn = document.getElementById("analyzeBtn");
const checkBtn = document.getElementById("checkBtn");
const result = document.getElementById("result");
const error = document.getElementById("error");

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
    return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "hr", "a"],
        ALLOWED_ATTR: ["href", "target"]
    });
}

const diffSection = document.getElementById("diffSection");
const diffContainer = document.getElementById("diffContainer");

let diffInstances = [];

async function renderDiff(diff) {
    if (!diff || !diff.trim()) {
        diffSection.hidden = true;
        diffContainer.innerHTML = "";
        return;
    }
    try {
        const { parsePatchFiles, FileDiff } = await import("https://esm.sh/@pierre/diffs");
        const files = parsePatchFiles(diff);
        diffInstances.forEach((d) => d.cleanUp());
        diffInstances = [];
        diffContainer.innerHTML = "";
        if (files.length === 0) {
            diffSection.hidden = true;
            return;
        }
        diffSection.hidden = false;
        for (const file of files) {
            const wrapper = document.createElement("div");
            wrapper.className = "diff-file-wrapper";
            diffContainer.appendChild(wrapper);
            const fileDiff = new FileDiff({
                theme: "dark-plus",
                themeType: "dark",
                diffStyle: "unified",
            });
            fileDiff.render({ fileDiff: file, fileContainer: wrapper });
            diffInstances.push(fileDiff);
        }
    } catch (e) {
        console.error("Failed to render diff:", e);
        diffSection.hidden = true;
        diffContainer.innerHTML = "";
    }
}

function showError(msg) {
    error.textContent = msg;
    result.innerHTML = "";
    diffSection.hidden = true;
    diffContainer.innerHTML = "";
    diffInstances.forEach((d) => d.cleanUp());
    diffInstances = [];
}

function showResult(text, diff) {
    error.textContent = "";
    result.innerHTML = renderMarkdown(text);
    renderDiff(diff || "");
}

function setLoading(loading) {
    analyzeBtn.disabled = loading;
    checkBtn.disabled = loading;
    if (loading) {
        result.textContent = "Analyzing...";
        diffSection.hidden = true;
        diffContainer.innerHTML = "";
        diffInstances.forEach((d) => d.cleanUp());
        diffInstances = [];
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
        showResult("");
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
        showResult("");
    } catch (e) {
        showError(e.message);
    }
});

refreshKeyStatus();
setModelTooltip();

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
        showResult("");
    } catch (e) {
        showError(e.message);
    } finally {
        loadModelsBtn.disabled = false;
        loadModelsBtn.textContent = "Load models";
    }
});

analyzeBtn.addEventListener("click", async () => {
    setLoading(true);
    try {
        const data = await post("/api/analyze", {
            api_key: apiKey.value.trim() || undefined,
            repo_path: repoPath.value.trim() || ".",
            ref: ref.value.trim() || "HEAD",
            model: model.value,
        });
        showResult(data.result, data.diff);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});

checkBtn.addEventListener("click", async () => {
    setLoading(true);
    try {
        const data = await post("/api/check", {
            api_key: apiKey.value.trim() || undefined,
            repo_path: repoPath.value.trim() || ".",
            model: model.value,
        });
        showResult(data.result, data.diff);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});
