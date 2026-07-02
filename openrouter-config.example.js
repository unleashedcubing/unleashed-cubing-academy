// Copy this file to openrouter-config.js for local development only.
// Do not commit real private keys if this app will be publicly accessible.

export const openrouterConfig = {
    apiKey: "paste-your-openrouter-key-here",
    backendUrl: "/api/assistant",
    leaderboardBackendUrl: "/api/leaderboard"
};

// Current free-model stack verified on OpenRouter on July 2, 2026:
// - openai/gpt-oss-120b:free
// - qwen/qwen3-next-80b-a3b-instruct:free
// - google/gemma-4-31b-it:free
// - meta-llama/llama-3.3-70b-instruct:free
