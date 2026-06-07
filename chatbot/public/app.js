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

        get activeConversation() {
            return this.conversations.find((c) => c.id === this.activeId);
        },

        async init() {
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
            try {
                const data = await this.api("/api/health");
                this.geminiOk = data.gemini;
            } catch {
                this.geminiOk = false;
            }
        },

        async loadSettings() {
            try {
                const data = await this.api("/api/settings");
                this.hasApiKey = data.hasApiKey;
                this.maskedKey = data.maskedKey;
            } catch {
                this.hasApiKey = false;
                this.maskedKey = null;
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
                const data = await this.api("/api/settings", {
                    method: "POST",
                    body: JSON.stringify({ apiKey }),
                });
                this.hasApiKey = true;
                this.maskedKey = data.maskedKey;
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
                await this.api("/api/settings", { method: "DELETE" });
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
            this.conversations = await this.api("/api/conversations");
        },

        async newChat() {
            const conv = await this.api("/api/conversations", { method: "POST" });
            this.conversations.unshift(conv);
            await this.selectConversation(conv.id);
            this.sidebarOpen = false;
        },

        async selectConversation(id) {
            this.activeId = id;
            this.messages = await this.api(`/api/conversations/${id}/messages`);
            this.sidebarOpen = false;
            this.$nextTick(() => this.scrollToBottom());
        },

        async deleteConversation(id, event) {
            event.stopPropagation();
            if (!confirm("Delete this conversation?")) return;
            await this.api(`/api/conversations/${id}`, { method: "DELETE" });
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

            const optimistic = {
                role: "user",
                content,
                created_at: new Date().toISOString(),
            };
            this.messages.push(optimistic);
            this.$nextTick(() => this.scrollToBottom());

            try {
                const data = await this.api(`/api/conversations/${this.activeId}/messages`, {
                    method: "POST",
                    body: JSON.stringify({ content }),
                });

                this.messages[this.messages.length - 1] = data.user;
                this.messages.push(data.assistant);
                await this.loadConversations();
            } catch (err) {
                this.chatError = err.message;
                this.toast(err.message, "error", 12000);
                this.messages = await this.api(`/api/conversations/${this.activeId}/messages`);
                await this.loadConversations();
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
            window.location.href = `/api/conversations/${this.activeId}/export`;
            this.toast("Exporting conversation…", "success");
        },

        async exportAll() {
            window.location.href = "/api/export";
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
                const result = await this.api("/api/import", {
                    method: "POST",
                    body: JSON.stringify(data),
                });
                await this.loadConversations();
                if (result.conversations?.length) {
                    await this.selectConversation(result.conversations[0].id);
                }
                this.toast(`Imported ${result.imported} conversation(s)`, "success");
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
