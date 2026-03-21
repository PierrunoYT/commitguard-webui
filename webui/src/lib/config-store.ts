import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR =
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "commitguard-webui")
    : path.join(os.homedir(), ".config", "commitguard-webui");

const API_KEY_FILE = path.join(CONFIG_DIR, "api_key");
const GITHUB_TOKEN_FILE = path.join(CONFIG_DIR, "github_token");

let keyCache: string | null | undefined = undefined;
let githubTokenCache: string | null | undefined = undefined;

function ensureConfigDir(): string {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  return CONFIG_DIR;
}

function writeSecretFile(filePath: string, value: string): void {
  ensureConfigDir();
  fs.writeFileSync(filePath, value.trim(), "utf-8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows may not support chmod
  }
}

function readSecretFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const value = fs.readFileSync(filePath, "utf-8").trim();
  return value || null;
}

export function saveApiKey(key: string): void {
  writeSecretFile(API_KEY_FILE, key);
  keyCache = undefined;
}

export function loadApiKey(): string | null {
  if (keyCache !== undefined) return keyCache;
  keyCache = readSecretFile(API_KEY_FILE);
  return keyCache;
}

export function hasSavedKey(): boolean {
  return loadApiKey() != null;
}

export function clearApiKey(): void {
  if (fs.existsSync(API_KEY_FILE)) {
    fs.unlinkSync(API_KEY_FILE);
  }
  keyCache = undefined;
}

export function saveGithubToken(token: string): void {
  writeSecretFile(GITHUB_TOKEN_FILE, token);
  githubTokenCache = undefined;
}

export function loadGithubToken(): string | null {
  if (githubTokenCache !== undefined) return githubTokenCache;
  githubTokenCache = readSecretFile(GITHUB_TOKEN_FILE);
  return githubTokenCache;
}

export function hasSavedGithubToken(): boolean {
  return loadGithubToken() != null;
}

export function clearGithubToken(): void {
  if (fs.existsSync(GITHUB_TOKEN_FILE)) {
    fs.unlinkSync(GITHUB_TOKEN_FILE);
  }
  githubTokenCache = undefined;
}
