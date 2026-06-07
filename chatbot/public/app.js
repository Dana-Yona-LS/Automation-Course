const STORAGE_KEY = "gemini_chatbot_v1";
const GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
];

function loadStore() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyStore();
    } catch {
        return emptyStore();
    }
}

function emptyStore() {
    return { apiKey: null, conversations: [], messages: {}, nextId: 1 };
}

function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function maskKey(key) {
    if (!key || key.length < 8) return null;
    return key.slice(0, 4) + "…" + key.slice(-4);
}

function now() {
    return new Date().toISOString();
}

function autoTitle(text) {
    const cleaned = text.trim().replace(/\s+/g, " ");
    return cleaned.length > 48 ? cleaned.slice(0, 48) + "…" : cleaned || "New Chat";
}

function formatGeminiError(msg) {
    if (msg.includes("429") || msg.includes("quota") || msg.includes("Quota exceeded")) {
        const retry = msg.match(/retry in ([\d.]+)s/i)?.[1];
        return retry
            ? `Gemini rate limit reached. Wait ${Math.ceil(Number(retry))} seconds and try again.`
            : "Gemini quota exceeded. Check usage at ai.google.dev or try again later.";
    }
    if (msg.includes("404") || msg.includes("NOT_FOUND")) {
        return "Gemini model not available. Try again later.";
    }
    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
        return "Invalid API key. Update it in Settings.";
    }
    if (msg.length > 180) return msg.slice(0, 180) + "…";
    return msg;
}

async function askGemini(apiKey, messages, userText) {
    const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));
    contents.push({ role: "user", parts: [{ text: userText }] });

    let lastError = "All Gemini models failed";
    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            lastError = body.error?.message || `Request failed (${res.status})`;
            if (res.status === 429 || res.status === 404) continue;
            throw new Error(formatGeminiError(lastError));
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
        lastError = "Empty response from Gemini";
    }

    throw new Error(formatGeminiError(lastError));
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

function chatApp() {
    return {
        conversations: [],
        activeId: null,
        messages: [],
        input: "",
        loading: false,
        sidebarOpen: false,
        geminiOk: false,
        toasts: [],
        settingsOpen: false,
        apiKeyInput: "",
        maskedKey: null,
        hasApiKey: false,
        savingKey: false,
        chatError: null,
        useServer: false,

        get activeConversation() {
            return this.conversations.find((c) => c.id === this.activeId);
        },

        async init() {
            this.useServer = await this.detectServer();
            await this.checkHealth();
            await this.loadSettings();
            await this.loadConversations();
            if (this.conversations.length) {
                await this.selectConversation(this.conversations[0].id);
            }
            if (!this.hasApiKey) {
                this.settingsOpen = true;
            }
        },

        async detectServer() {
            if (location.hostname.includes("github.io")) return false;
            try {
                const res = await fetch("/api/health");
                return res.ok;
            } catch {
                return false;
            }
        },

        async api(path, options = {}) {
            const res = await fetch(path, {
                headers: { "Content-Type": "application/json" },
                ...options,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Request failed (${res.status})`);
            }
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return res.json();
            return res;
        },

        async checkHealth() {
            if (this.useServer) {
                try {
                    const data = await this.api("/api/health");
                    this.geminiOk = data.gemini;
                } catch {
                    this.geminiOk = false;
                }
            } else {
                this.geminiOk = Boolean(loadStore().apiKey);
            }
        },

        async loadSettings() {
            if (this.useServer) {
                try {
                    const data = await this.api("/api/settings");
                    this.hasApiKey = data.hasApiKey;
                    this.maskedKey = data.maskedKey;
                } catch {
                    this.hasApiKey = false;
                    this.maskedKey = null;
                }
            } else {
                const store = loadStore();
                this.hasApiKey = Boolean(store.apiKey);
                this.maskedKey = maskKey(store.apiKey);
            }
        },

        openSettings() {
            this.apiKeyInput = "";
            this.settingsOpen = true;
            this.sidebarOpen = false;
        },

        closeSettings() {
            this.settingsOpen = false;
            this.apiKeyInput = "";
        },

        async saveApiKey() {
            const apiKey = this.apiKeyInput.trim();
            if (!apiKey) {
                this.toast("Please enter an API key", "error");
                return;
            }

            this.savingKey = true;
            try {
                if (this.useServer) {
                    const data = await this.api("/api/settings", {
                        method: "POST",
                        body: JSON.stringify({ apiKey }),
                    });
                    this.maskedKey = data.maskedKey;
                } else {
                    const store = loadStore();
                    store.apiKey = apiKey;
                    saveStore(store);
                    this.maskedKey = maskKey(apiKey);
                }
                this.hasApiKey = true;
                this.geminiOk = true;
                this.apiKeyInput = "";
                this.settingsOpen = false;
                this.toast("API key saved", "success");
            } catch (err) {
                this.toast(err.message, "error");
            } finally {
                this.savingKey = false;
            }
        },

        async removeApiKey() {
            if (!confirm("Remove the saved API key?")) return;
            try {
                if (this.useServer) {
                    await this.api("/api/settings", { method: "DELETE" });
                } else {
                    const store = loadStore();
                    store.apiKey = null;
                    saveStore(store);
                }
                this.hasApiKey = false;
                this.maskedKey = null;
                this.geminiOk = false;
                this.apiKeyInput = "";
                this.toast("API key removed", "success");
            } catch (err) {
                this.toast(err.message, "error");
            }
        },

        async loadConversations() {
            if (this.useServer) {
                this.conversations = await this.api("/api/conversations");
                return;
            }

            const store = loadStore();
            this.conversations = [...store.conversations].sort(
                (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
            );
        },

        async newChat() {
            if (this.useServer) {
                const conv = await this.api("/api/conversations", { method: "POST" });
                this.conversations.unshift(conv);
                await this.selectConversation(conv.id);
                this.sidebarOpen = false;
                return;
            }

            const store = loadStore();
            const ts = now();
            const conv = {
                id: store.nextId++,
                title: "New Chat",
                created_at: ts,
                updated_at: ts,
            };
            store.conversations.unshift(conv);
            store.messages[conv.id] = [];
            saveStore(store);
            this.conversations.unshift(conv);
            await this.selectConversation(conv.id);
            this.sidebarOpen = false;
        },

        async selectConversation(id) {
            this.activeId = id;
            if (this.useServer) {
                this.messages = await this.api(`/api/conversations/${id}/messages`);
            } else {
                const store = loadStore();
                this.messages = store.messages[id] || [];
            }
            this.sidebarOpen = false;
            this.$nextTick(() => this.scrollToBottom());
        },

        async deleteConversation(id, event) {
            event.stopPropagation();
            if (!confirm("Delete this conversation?")) return;

            if (this.useServer) {
                await this.api(`/api/conversations/${id}`, { method: "DELETE" });
            } else {
                const store = loadStore();
                store.conversations = store.conversations.filter((c) => c.id !== id);
                delete store.messages[id];
                saveStore(store);
            }

            this.conversations = this.conversations.filter((c) => c.id !== id);
            if (this.activeId === id) {
                if (this.conversations.length) {
                    await this.selectConversation(this.conversations[0].id);
                } else {
                    this.activeId = null;
                    this.messages = [];
                }
            }
            this.toast("Conversation deleted", "success");
        },

        async sendMessage(text) {
            const content = (text || this.input).trim();
            if (!content || this.loading) return;

            if (!this.hasApiKey) {
                this.toast("Add your Gemini API key in Settings first", "error");
                this.openSettings();
                return;
            }

            if (!this.activeId) {
                await this.newChat();
            }

            this.input = "";
            this.loading = true;
            this.chatError = null;

            const ts = now();
            const userMsg = { role: "user", content, created_at: ts };
            this.messages.push(userMsg);
            this.$nextTick(() => this.scrollToBottom());

            try {
                if (this.useServer) {
                    const data = await this.api(`/api/conversations/${this.activeId}/messages`, {
                        method: "POST",
                        body: JSON.stringify({ content }),
                    });
                    this.messages[this.messages.length - 1] = data.user;
                    this.messages.push(data.assistant);
                } else {
                    const store = loadStore();
                    const conv = store.conversations.find((c) => c.id === this.activeId);
                    const history = store.messages[this.activeId] || [];

                    store.messages[this.activeId] = [...history, userMsg];
                    if (conv?.title === "New Chat") conv.title = autoTitle(content);
                    if (conv) conv.updated_at = ts;
                    saveStore(store);

                    const reply = await askGemini(store.apiKey, history, content);
                    const assistantMsg = { role: "assistant", content: reply, created_at: now() };
                    store.messages[this.activeId].push(assistantMsg);
                    if (conv) conv.updated_at = assistantMsg.created_at;
                    saveStore(store);

                    this.messages.push(assistantMsg);
                }
                await this.loadConversations();
            } catch (err) {
                this.chatError = err.message;
                this.toast(err.message, "error", 12000);
                if (this.useServer) {
                    this.messages = await this.api(`/api/conversations/${this.activeId}/messages`);
                }
            } finally {
                this.loading = false;
                this.$nextTick(() => this.scrollToBottom());
            }
        },

        onEnter(e) {
            if (e.shiftKey) return;
            e.preventDefault();
            this.sendMessage();
        },

        autoResize(el) {
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 160) + "px";
        },

        scrollToBottom() {
            const el = this.$refs.messages;
            if (el) el.scrollTop = el.scrollHeight;
        },

        formatTime(iso) {
            if (!iso) return "";
            return new Date(iso).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        },

        async exportCurrent() {
            if (!this.activeId) return;

            if (this.useServer) {
                window.location.href = `/api/conversations/${this.activeId}/export`;
            } else {
                const store = loadStore();
                const conv = store.conversations.find((c) => c.id === this.activeId);
                downloadJson(`chat-${this.activeId}.json`, {
                    version: 1,
                    exported_at: now(),
                    conversation: {
                        title: conv.title,
                        created_at: conv.created_at,
                        updated_at: conv.updated_at,
                        messages: store.messages[this.activeId] || [],
                    },
                });
            }
            this.toast("Exporting conversation…", "success");
        },

        async exportAll() {
            if (this.useServer) {
                window.location.href = "/api/export";
            } else {
                const store = loadStore();
                downloadJson("chat-history.json", {
                    version: 1,
                    exported_at: now(),
                    conversations: store.conversations.map((c) => ({
                        title: c.title,
                        created_at: c.created_at,
                        updated_at: c.updated_at,
                        messages: store.messages[c.id] || [],
                    })),
                });
            }
            this.toast("Exporting all chats…", "success");
        },

        triggerImport() {
            this.$refs.importInput.click();
        },

        async handleImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (this.useServer) {
                    const result = await this.api("/api/import", {
                        method: "POST",
                        body: JSON.stringify(data),
                    });
                    await this.loadConversations();
                    if (result.conversations?.length) {
                        await this.selectConversation(result.conversations[0].id);
                    }
                    this.toast(`Imported ${result.imported} conversation(s)`, "success");
                } else {
                    const items = data.conversations
                        ? data.conversations
                        : data.conversation
                          ? [data.conversation]
                          : null;
                    if (!items?.length) throw new Error("Invalid JSON format");

                    const store = loadStore();
                    for (const item of items) {
                        const ts = now();
                        const id = store.nextId++;
                        store.conversations.unshift({
                            id,
                            title: item.title?.trim() || "Imported Chat",
                            created_at: item.created_at || ts,
                            updated_at: item.updated_at || ts,
                        });
                        store.messages[id] = (item.messages || []).filter(
                            (m) => m.content && ["user", "assistant"].includes(m.role),
                        );
                    }
                    saveStore(store);
                    await this.loadConversations();
                    if (this.conversations.length) {
                        await this.selectConversation(this.conversations[0].id);
                    }
                    this.toast(`Imported ${items.length} conversation(s)`, "success");
                }
            } catch (err) {
                this.toast(err.message || "Import failed", "error");
            }

            event.target.value = "";
        },

        toast(message, type = "success", duration = 3500) {
            const id = Date.now();
            this.toasts.push({ id, message, type });
            setTimeout(() => {
                this.toasts = this.toasts.filter((t) => t.id !== id);
            }, duration);
        },
    };
}
