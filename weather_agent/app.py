"""Streamlit UI for the LangChain / LangGraph weather agent (standalone — not myChat.py)."""

import json
import os
import sys
import urllib.request
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
AGENT_DIR = Path(__file__).resolve().parent
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))

load_dotenv(AGENT_DIR / ".env")

from agent import build_agent, chat

DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")
DEFAULT_CITY = "Tel Aviv"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"


def _api_key_configured() -> bool:
    return bool(os.getenv("OPENWEATHERMAP_API_KEY", "").strip())


@st.cache_data(ttl=30, show_spinner=False)
def _list_ollama_models() -> list[str]:
    try:
        with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=3) as response:
            payload = json.loads(response.read().decode())
        return [model["name"] for model in payload.get("models", [])]
    except Exception:
        return []


def _agent_for_model(model_name: str):
    cache_key = f"agent::{model_name}"
    if cache_key not in st.session_state:
        st.session_state[cache_key] = build_agent(model_name)
    return st.session_state[cache_key]


def _clear_agent_cache() -> None:
    for key in list(st.session_state.keys()):
        if isinstance(key, str) and key.startswith("agent::"):
            del st.session_state[key]


def _render_sidebar() -> str:
    with st.sidebar:
        st.header("Weather agent")
        st.caption("LangChain · OpenWeatherMap · `gemma3:1b`")

        if _api_key_configured():
            st.success("API key loaded")
        else:
            st.error("Set `OPENWEATHERMAP_API_KEY` in `weather_agent/.env`")

        installed = _list_ollama_models()
        if installed:
            model = st.selectbox(
                "Ollama model",
                options=installed,
                index=installed.index(DEFAULT_MODEL) if DEFAULT_MODEL in installed else 0,
            )
        else:
            st.warning("Cannot reach Ollama — enter model name manually")
            model = st.text_input("Ollama model", value=DEFAULT_MODEL)

        if model != st.session_state.get("active_model"):
            _clear_agent_cache()
            st.session_state.active_model = model

        st.divider()
        st.subheader("Quick ask")
        city = st.text_input("City", value=DEFAULT_CITY, placeholder="e.g. Paris,FR")
        if st.button(
            "Weekly forecast",
            type="primary",
            disabled=not _api_key_configured(),
            use_container_width=True,
        ):
            city_name = city.strip() or DEFAULT_CITY
            st.session_state.pending_prompt = (
                f"What will the temperature be in {city_name} over the next week?"
            )

        if st.button("Clear conversation", use_container_width=True):
            st.session_state.pop("messages", None)
            st.session_state.pop("pending_prompt", None)
            _clear_agent_cache()
            st.rerun()

    return model


def _history_for_agent() -> list[dict[str, str]]:
    return [
        {"role": message["role"], "content": message["content"]}
        for message in st.session_state.messages
        if message["role"] in ("user", "assistant")
    ]


def _run_agent(prompt: str, model: str) -> str:
    history = _history_for_agent()
    history.append({"role": "user", "content": prompt})

    agent = _agent_for_model(model)
    with st.spinner("Running weather agent…"):
        return chat(history, agent=agent)


def _handle_user_message(prompt: str, model: str) -> None:
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        try:
            response = _run_agent(prompt, model)
        except Exception as exc:
            response = f"Agent error: {exc}"
        st.markdown(response)

    st.session_state.messages.append({"role": "user", "content": prompt})
    st.session_state.messages.append({"role": "assistant", "content": response})


st.set_page_config(
    page_title="Weather Agent",
    page_icon="🌤️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    .block-container { padding-top: 1.5rem; }
    [data-testid="stSidebar"] { background: linear-gradient(180deg, #0e7490 0%, #164e63 100%); }
    [data-testid="stSidebar"] * { color: #f0fdfa !important; }
    [data-testid="stSidebar"] .stButton button {
        background: #f0fdfa; color: #164e63 !important; border: none;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

model = _render_sidebar()

st.title("🌤️ Weather Agent")
st.markdown(
    "Ask about **temperature** and **weekly forecasts** for any city. "
    "Extracts the city, fetches OpenWeatherMap data, then summarizes with your Ollama model."
)

if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": (
                "Hello! I can look up weekly forecasts for any city. "
                f'Try: *"What\'s the weather in {DEFAULT_CITY} this week?"*'
            ),
        }
    ]

chat_col, info_col = st.columns([3, 1])

with info_col:
    st.info(
        "**How it works**\n\n"
        "1. You ask in natural language\n"
        "2. City name is detected from your question\n"
        "3. `get_weekly_forecast` fetches data\n"
        "4. `gemma3:1b` summarizes temps in °C"
    )
    if not _api_key_configured():
        st.warning("Copy `.env.example` → `.env` and add your OpenWeatherMap key.")

with chat_col:
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    pending = st.session_state.pop("pending_prompt", None)
    if pending:
        if not _api_key_configured():
            st.error("Configure `OPENWEATHERMAP_API_KEY` before chatting.")
        else:
            _handle_user_message(pending, model)

    user_prompt = st.chat_input("Ask about weather in a city…")
    if user_prompt:
        if not _api_key_configured():
            st.error("Add `OPENWEATHERMAP_API_KEY` to `weather_agent/.env` first.")
        else:
            _handle_user_message(user_prompt, model)
