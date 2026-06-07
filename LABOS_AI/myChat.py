import json
import random
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import ollama
import streamlit as st
from ollama import chat

FUNNY_ICONS = ["🦖", "🤡", "🌮", "🦄", "👾", "🍕", "🎪", "🐸", "🛸", "🎸", "🧙", "🦩"]

TIMEZONE_OPTIONS = sorted(
    [
        "UTC",
        "Asia/Jerusalem",
        "Europe/London",
        "Europe/Paris",
        "America/New_York",
        "America/Chicago",
        "America/Los_Angeles",
        "Asia/Tokyo",
        "Asia/Dubai",
        "Australia/Sydney",
    ]
)

WMO_WEATHER = {
    0: ("☀️", "Clear"),
    1: ("🌤️", "Mainly clear"),
    2: ("⛅", "Partly cloudy"),
    3: ("☁️", "Overcast"),
    45: ("🌫️", "Fog"),
    48: ("🌫️", "Fog"),
    51: ("🌦️", "Drizzle"),
    61: ("🌧️", "Rain"),
    63: ("🌧️", "Rain"),
    65: ("🌧️", "Heavy rain"),
    71: ("🌨️", "Snow"),
    80: ("🌦️", "Showers"),
    95: ("⛈️", "Thunderstorm"),
}


def _http_get_json(url: str, timeout: int = 8) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DanaChat/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


@st.cache_data(ttl=600, show_spinner=False)
def fetch_weather(city: str) -> dict | None:
    city = city.strip()
    if not city:
        return None

    geo_url = (
        "https://geocoding-api.open-meteo.com/v1/search?"
        + urllib.parse.urlencode({"name": city, "count": 1, "language": "en", "format": "json"})
    )
    geo = _http_get_json(geo_url)
    if not geo or not geo.get("results"):
        return None

    place = geo["results"][0]
    lat, lon = place["latitude"], place["longitude"]
    label = place.get("name", city)
    if place.get("country"):
        label = f"{label}, {place['country']}"

    wx_url = (
        "https://api.open-meteo.com/v1/forecast?"
        + urllib.parse.urlencode(
            {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,weather_code",
                "timezone": "auto",
            }
        )
    )
    wx = _http_get_json(wx_url)
    if not wx or "current" not in wx:
        return None

    current = wx["current"]
    code = int(current.get("weather_code", -1))
    emoji, desc = WMO_WEATHER.get(code, ("🌡️", "Unknown"))
    temp = current.get("temperature_2m")
    return {
        "city": label,
        "emoji": emoji,
        "description": desc,
        "temp_c": temp,
    }


def render_dashboard(timezone: str, city: str) -> None:
    if "funny_icon" not in st.session_state:
        st.session_state.funny_icon = random.choice(FUNNY_ICONS)

    try:
        now = datetime.now(ZoneInfo(timezone))
        time_str = now.strftime("%A, %b %d · %H:%M:%S")
        tz_label = timezone.replace("_", " ")
    except Exception:
        time_str = "Invalid timezone"
        tz_label = timezone

    weather = fetch_weather(city) if city.strip() else None
    if weather and weather.get("temp_c") is not None:
        weather_line = (
            f"{weather['emoji']} {weather['temp_c']:.0f}°C · {weather['description']} · {weather['city']}"
        )
    elif city.strip():
        weather_line = "🌡️ Weather unavailable — check city name"
    else:
        weather_line = "🌡️ Enter a city in the sidebar for weather"

    with st.container(border=True):
        icon_col, info_col = st.columns([1, 5])
        with icon_col:
            st.markdown(
                f"<div style='font-size:4rem;text-align:center;'>{st.session_state.funny_icon}</div>",
                unsafe_allow_html=True,
            )
            if st.button("New icon 🎲", key="shuffle_icon"):
                st.session_state.funny_icon = random.choice(FUNNY_ICONS)
                st.rerun()
        with info_col:
            st.markdown("### Dashboard")
            st.markdown(f"🕐 **{time_str}**  \n*{tz_label}*")
            st.markdown(f"**Weather:** {weather_line}")


st.set_page_config(page_title="DON`T ask me", page_icon="🦖", layout="centered")

st.title("DON`T ask me")
st.caption("Dana Chat powered by `ollama.chat()`.")

with st.sidebar:
    st.header("Settings")
    try:
        installed = [m.model for m in ollama.list().models]
    except Exception:
        installed = []

    default_model = "gemma3:1b"
    if installed:
        model = st.selectbox(
            "Model",
            options=installed,
            index=installed.index(default_model) if default_model in installed else 0,
        )
    else:
        model = st.text_input("Model", value=default_model)

    temperature = st.slider("Temperature", min_value=0.0, max_value=2.0, value=0.7, step=0.05)

    st.divider()
    st.subheader("Dashboard")
    timezone = st.selectbox("Timezone", TIMEZONE_OPTIONS, index=TIMEZONE_OPTIONS.index("Asia/Jerusalem"))
    city = st.text_input("City (weather)", value="Tel Aviv", placeholder="e.g. Tel Aviv")

    if st.button("Clear chat"):
        st.session_state.pop("messages", None)
        st.rerun()

render_dashboard(timezone, city)

if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "Hi! Ask me anything."}
    ]

for m in st.session_state.messages:
    with st.chat_message(m["role"]):
        st.markdown(m["content"])

user_prompt = st.chat_input("Type your message…")
if user_prompt:
    st.session_state.messages.append({"role": "user", "content": user_prompt})
    with st.chat_message("user"):
        st.markdown(user_prompt)

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            try:
                response = chat(
                    model=model,
                    messages=st.session_state.messages,
                    options={"temperature": float(temperature)},
                )
                assistant_text = response["message"]["content"]
            except Exception as e:
                assistant_text = f"Error calling Ollama: {e}"
        st.markdown(assistant_text)

    st.session_state.messages.append({"role": "assistant", "content": assistant_text})
