import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "chat.db");
const PUBLIC_DIR = path.join(__dirname, "public");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const API_KEY_SETTING = "gemini_api_key";

function getApiKey() {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(API_KEY_SETTING);
    return row?.value || null;
}

function setApiKey(key) {
    db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(API_KEY_SETTING, key);
}

function deleteApiKey() {
    db.prepare("DELETE FROM settings WHERE key = ?").run(API_KEY_SETTING);
}

function maskApiKey(key) {
    if (!key || key.length < 8) return null;
    return key.slice(0, 4) + "…" + key.slice(-4);
}

const MIME = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function now() {
    return new Date().toISOString();
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString();
            if (!raw) return resolve(null);
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}

function send(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
    send(res, status, { error: message });
}

function parseUrl(req) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);
    return { url, parts };
}

function getConversation(id) {
    return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
}

function getMessages(conversationId) {
    return db
        .prepare(
            "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC",
        )
        .all(conversationId);
}

function buildGeminiHistory(conversationId) {
    const rows = getMessages(conversationId);
    return rows.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));
}

function formatGeminiError(err) {
    const msg = err?.message || String(err);

    if (msg.includes("429") || msg.includes("quota") || msg.includes("Quota exceeded")) {
        const retrySec =
            msg.match(/retry in ([\d.]+)s/i)?.[1] ||
            msg.match(/retryDelay":"(\d+)s/)?.[1];
        if (retrySec) {
            return `Gemini rate limit reached. Wait ${Math.ceil(Number(retrySec))} seconds and try again.`;
        }
        return "Gemini quota exceeded. Check your usage at ai.google.dev or try again later.";
    }

    if (msg.includes("404") || msg.includes("NOT_FOUND")) {
        return "Gemini model not available. Update the app or try again later.";
    }

    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
        return "Invalid API key. Update it in Settings.";
    }

    if (msg.length > 180) return msg.slice(0, 180) + "…";
    return msg;
}

function isRetryableModelError(err) {
    const msg = err?.message || "";
    return (
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("404") ||
        msg.includes("NOT_FOUND")
    );
}

async function askGemini(conversationId, userText) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("No API key configured. Open Settings and add your Gemini API key.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const history = buildGeminiHistory(conversationId);
    const models = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
    ];

    let lastError;
    for (let i = 0; i < models.length; i++) {
        const modelName = models[i];
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const chat = model.startChat({ history });
            const result = await chat.sendMessage(userText);
            return result.response.text();
        } catch (err) {
            lastError = err;
            if (i < models.length - 1 && isRetryableModelError(err)) continue;
            throw err;
        }
    }

    throw lastError || new Error("All Gemini models failed");
}

function autoTitle(text) {
    const cleaned = text.trim().replace(/\s+/g, " ");
    return cleaned.length > 48 ? cleaned.slice(0, 48) + "…" : cleaned || "New Chat";
}

const routes = {
    "GET /api/health": (_req, res) => {
        send(res, 200, {
            ok: true,
            gemini: Boolean(getApiKey()),
        });
    },

    "GET /api/settings": (_req, res) => {
        const key = getApiKey();
        send(res, 200, {
            hasApiKey: Boolean(key),
            maskedKey: maskApiKey(key),
        });
    },

    "POST /api/settings": async (req, res) => {
        let body;
        try {
            body = await readBody(req);
        } catch {
            return sendError(res, 400, "Invalid JSON body");
        }

        const apiKey = body?.apiKey?.trim();
        if (!apiKey) return sendError(res, 400, "API key is required");

        setApiKey(apiKey);
        send(res, 200, { saved: true, maskedKey: maskApiKey(apiKey) });
    },

    "DELETE /api/settings": (_req, res) => {
        deleteApiKey();
        send(res, 200, { deleted: true });
    },

    "GET /api/conversations": (_req, res) => {
        const rows = db
            .prepare(
                `SELECT c.*,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
         FROM conversations c
         ORDER BY c.updated_at DESC`,
            )
            .all();
        send(res, 200, rows);
    },

    "POST /api/conversations": (_req, res) => {
        const ts = now();
        const result = db
            .prepare(
                "INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
            )
            .run("New Chat", ts, ts);
        send(res, 201, getConversation(result.lastInsertRowid));
    },

    "DELETE /api/conversations/:id": (_req, res, id) => {
        const conv = getConversation(id);
        if (!conv) return sendError(res, 404, "Conversation not found");
        db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
        send(res, 200, { deleted: true });
    },

    "GET /api/conversations/:id/messages": (_req, res, id) => {
        if (!getConversation(id)) return sendError(res, 404, "Conversation not found");
        send(res, 200, getMessages(id));
    },

    "POST /api/conversations/:id/messages": async (req, res, id) => {
        const conv = getConversation(id);
        if (!conv) return sendError(res, 404, "Conversation not found");

        let body;
        try {
            body = await readBody(req);
        } catch {
            return sendError(res, 400, "Invalid JSON body");
        }

        const content = body?.content?.trim();
        if (!content) return sendError(res, 400, "Message content is required");

        const ts = now();
        db.prepare(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
        ).run(id, content, ts);

        if (conv.title === "New Chat") {
            db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
                autoTitle(content),
                ts,
                id,
            );
        }

        let reply;
        try {
            reply = await askGemini(id, content);
        } catch (err) {
            return sendError(res, 502, formatGeminiError(err));
        }

        const replyTs = now();
        db.prepare(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)",
        ).run(id, reply, replyTs);

        db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(replyTs, id);

        send(res, 200, {
            user: { role: "user", content, created_at: ts },
            assistant: { role: "assistant", content: reply, created_at: replyTs },
        });
    },

    "GET /api/conversations/:id/export": (_req, res, id) => {
        const conv = getConversation(id);
        if (!conv) return sendError(res, 404, "Conversation not found");

        const payload = {
            version: 1,
            exported_at: now(),
            conversation: {
                title: conv.title,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                messages: getMessages(id),
            },
        };

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="chat-${id}.json"`,
        });
        res.end(JSON.stringify(payload, null, 2));
    },

    "GET /api/export": (_req, res) => {
        const conversations = db
            .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
            .all()
            .map((c) => ({
                title: c.title,
                created_at: c.created_at,
                updated_at: c.updated_at,
                messages: getMessages(c.id),
            }));

        const payload = {
            version: 1,
            exported_at: now(),
            conversations,
        };

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="chat-history.json"',
        });
        res.end(JSON.stringify(payload, null, 2));
    },

    "POST /api/import": async (req, res) => {
        let body;
        try {
            body = await readBody(req);
        } catch {
            return sendError(res, 400, "Invalid JSON body");
        }

        const items = body.conversations
            ? body.conversations
            : body.conversation
              ? [body.conversation]
              : null;

        if (!items?.length) {
            return sendError(res, 400, "JSON must contain conversation or conversations");
        }

        const importOne = db.transaction((conv) => {
            const ts = now();
            const title = conv.title?.trim() || "Imported Chat";
            const result = db
                .prepare(
                    "INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
                )
                .run(title, conv.created_at || ts, conv.updated_at || ts);

            const convId = result.lastInsertRowid;
            const insert = db.prepare(
                "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            );

            for (const msg of conv.messages || []) {
                if (!msg.content || !["user", "assistant"].includes(msg.role)) continue;
                insert.run(convId, msg.role, msg.content, msg.created_at || ts);
            }

            return getConversation(convId);
        });

        const imported = items.map((c) => importOne(c));
        send(res, 201, { imported: imported.length, conversations: imported });
    },
};

function matchRoute(method, parts) {
    const key = `${method} /${parts.join("/")}`;

    if (key === "GET /api/health") return { handler: routes["GET /api/health"] };
    if (key === "GET /api/conversations") return { handler: routes["GET /api/conversations"] };
    if (key === "POST /api/conversations") return { handler: routes["POST /api/conversations"] };
    if (key === "GET /api/export") return { handler: routes["GET /api/export"] };
    if (key === "POST /api/import") return { handler: routes["POST /api/import"] };
    if (key === "GET /api/settings") return { handler: routes["GET /api/settings"] };
    if (key === "POST /api/settings") return { handler: routes["POST /api/settings"] };
    if (key === "DELETE /api/settings") return { handler: routes["DELETE /api/settings"] };

    if (parts[0] === "api" && parts[1] === "conversations" && parts[2]) {
        const id = Number(parts[2]);
        if (!Number.isInteger(id)) return null;

        if (parts.length === 3 && method === "DELETE") {
            return { handler: routes["DELETE /api/conversations/:id"], id };
        }
        if (parts.length === 4 && parts[3] === "messages" && method === "GET") {
            return { handler: routes["GET /api/conversations/:id/messages"], id };
        }
        if (parts.length === 4 && parts[3] === "messages" && method === "POST") {
            return { handler: routes["POST /api/conversations/:id/messages"], id };
        }
        if (parts.length === 4 && parts[3] === "export" && method === "GET") {
            return { handler: routes["GET /api/conversations/:id/export"], id };
        }
    }

    return null;
}

function serveStatic(req, res) {
    let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url);
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end("Not found");
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        return res.end();
    }

    const { parts } = parseUrl(req);

    if (parts[0] === "api") {
        const match = matchRoute(req.method, parts);
        if (match) {
            try {
                await match.handler(req, res, match.id);
            } catch (err) {
                console.error(err);
                sendError(res, 500, "Internal server error");
            }
            return;
        }
        return sendError(res, 404, "API route not found");
    }

    serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  ✦ Gemini Chatbot running at http://localhost:${PORT}`);
    if (!getApiKey()) {
        console.log("  ⚠  No API key yet — add it in the app Settings\n");
    } else {
        console.log("  ✓  Gemini API key configured\n");
    }
});
