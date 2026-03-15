const apiKey = document.getElementById("apiKey");
const repoPath = document.getElementById("repoPath");
const model = document.getElementById("model");
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
