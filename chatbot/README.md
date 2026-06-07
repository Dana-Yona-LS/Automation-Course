# Gemini Chatbot

AI chatbot powered by Google Gemini with SQLite chat history and JSON import/export.

## Features

- Chat with Gemini (multiple model fallback)
- Save conversations in SQLite
- Import / export chat history as JSON
- API key stored in-app (Settings), not in project files

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 and add your Gemini API key in **Settings**.

Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

## Deploy live (from GitHub)

> **Note:** GitHub Pages only hosts static websites. This app needs a Node.js server, so use a free host like [Render](https://render.com) connected to your GitHub repo.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Gemini chatbot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gemini-chatbot.git
git push -u origin main
```

Create the empty repo first on GitHub: **New repository** → name it `gemini-chatbot` → do not add README.

### 2. Deploy on Render (free)

1. Go to [render.com](https://render.com) and sign in with GitHub
2. **New → Web Service** → select your `gemini-chatbot` repo
3. Render detects `render.yaml` automatically
4. Click **Deploy**
5. Open your live URL and add your API key in Settings

Your app will be available at a URL like `https://gemini-chatbot.onrender.com`.

## Stack

- Frontend: HTML, CSS, Alpine.js
- Backend: Node.js (plain HTTP server)
- Database: SQLite
- LLM: Google Gemini API
