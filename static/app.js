const apiKey = document.getElementById("apiKey");
const repoPath = document.getElementById("repoPath");
const model = document.getElementById("model");
const loadModelsBtn = document.getElementById("loadModelsBtn");
const ref = document.getElementById("ref");
const analyzeBtn = document.getElementById("analyzeBtn");
const checkBtn = document.getElementById("checkBtn");
const result = document.getElementById("result");
const error = document.getElementById("error");

function showError(msg) {
    error.textContent = msg;
    result.textContent = "";
}

function showResult(text) {
    error.textContent = "";
    result.textContent = text;
}

function setLoading(loading) {
    analyzeBtn.disabled = loading;
    checkBtn.disabled = loading;
    if (loading) {
        result.textContent = "Analyzing...";
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

loadModelsBtn.addEventListener("click", async () => {
    const key = apiKey.value.trim();
    if (!key) {
        showError("Please enter your OpenRouter API key first.");
        return;
    }
    loadModelsBtn.disabled = true;
    loadModelsBtn.textContent = "Loading...";
    try {
        const { models } = await post("/api/models", { api_key: key });
        const current = model.value;
        model.innerHTML = "";
        for (const m of models) {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            if (m.id === current) opt.selected = true;
            model.appendChild(opt);
        }
        if (!model.value && models.length) model.selectedIndex = 0;
        showResult("");
    } catch (e) {
        showError(e.message);
    } finally {
        loadModelsBtn.disabled = false;
        loadModelsBtn.textContent = "Load models";
    }
});

analyzeBtn.addEventListener("click", async () => {
    const key = apiKey.value.trim();
    if (!key) {
        showError("Please enter your OpenRouter API key.");
        return;
    }
    setLoading(true);
    try {
        const { result: text } = await post("/api/analyze", {
            api_key: key,
            repo_path: repoPath.value.trim() || ".",
            ref: ref.value.trim() || "HEAD",
            model: model.value,
        });
        showResult(text);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});

checkBtn.addEventListener("click", async () => {
    const key = apiKey.value.trim();
    if (!key) {
        showError("Please enter your OpenRouter API key.");
        return;
    }
    setLoading(true);
    try {
        const { result: text } = await post("/api/check", {
            api_key: key,
            repo_path: repoPath.value.trim() || ".",
            model: model.value,
        });
        showResult(text);
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
});
