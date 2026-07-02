// Copy this file to openrouter-config.js for local development only.
// Do not commit real private keys if this app will be publicly accessible.
// If you want the key to be "not visible", do NOT put it in frontend code.
// Put OPENROUTER_API_KEY on your backend host as an environment variable instead.

export const openrouterConfig = {
    apiKey: "paste-your-openrouter-key-here",
    backendUrl: "/api/assistant",
    leaderboardBackendUrl: "/api/leaderboard",
    wcaMetaBackendUrl: "/api/wca-meta",
    leaderboardDirectBaseUrl: "https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1"
};

// Current free-model stack verified on OpenRouter on July 2, 2026:
// - qwen/qwen3-next-80b-a3b-instruct:free
// - openai/gpt-oss-120b:free
// - google/gemma-4-31b-it:free
// - meta-llama/llama-3.3-70b-instruct:free
