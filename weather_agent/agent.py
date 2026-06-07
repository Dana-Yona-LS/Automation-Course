import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableConfig
from langchain_ollama import ChatOllama

AGENT_DIR = Path(__file__).resolve().parent
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))

from tools.weather_tools import get_weekly_forecast

load_dotenv(AGENT_DIR / ".env")

IRRELEVANT_REPLY = "ask Bilal"

SUMMARY_RULES = """You are a helpful weather assistant.
Summarize the forecast clearly: list each day with min/max/day temperatures in Celsius.
If the data covers fewer than 7 days, explain that the free OpenWeatherMap tier covers 5 days,
and 7+ days need One Call API 3.0 enabled on their account.
Always mention the city name in your answer."""

EXTRACT_PROMPT = PromptTemplate.from_template(
    """Reply with ONLY the city name for a weather API lookup.
Use a country code when helpful (e.g. London,GB). No quotes, no explanation.
If no city is mentioned, reply exactly: NONE

User message:
{question}

City:"""
)

SUMMARIZE_PROMPT = PromptTemplate.from_template(
    """{rules}

User question:
{question}

City: {city}

Forecast data from OpenWeatherMap:
{forecast}

Write a clear, friendly answer:"""
)

_CITY_IN_QUESTION = re.compile(
    r"(?:weather|forecast|temperature|temp(?:erature)?|"
    r"what(?:'s| is) the (?:weather|temperature))"
    r".{0,40}?\bin\s+([A-Za-z][\w\s,\'-]+?)"
    r"(?:\s+(?:this|next|over|for)|\?|$)",
    re.IGNORECASE | re.DOTALL,
)
_CITY_BEFORE_WEATHER = re.compile(
    r"^([A-Za-z][\w\s,\'-]+?)\s+(?:weather|forecast|temperature)",
    re.IGNORECASE,
)
_WEATHER_KEYWORDS = re.compile(
    r"\b(weather|forecast|temperature|temp(?:erature)?|rain(?:ing)?|snow(?:ing)?|"
    r"sunny|cloud(?:y|s)?|humidity|celsius|fahrenheit|degrees|°c|°f|"
    r"hot(?:ter)?|cold(?:er)?|climate|wind(?:y)?|storm|drizzle|overcast)\b",
    re.IGNORECASE,
)
_OFF_TOPIC = re.compile(
    r"\b(joke|poem|story|recipe|capital of|president|prime minister|"
    r"math|calculate|who is the president|who is the prime minister)\b",
    re.IGNORECASE,
)
_CITY_ONLY = re.compile(r"^[A-Za-z][A-Za-z\s,\'-]{0,60}$")
_FOLLOW_UP = re.compile(r"\b(and|also|what about|how about)\b", re.IGNORECASE)
_FOLLOW_UP_CITY = re.compile(
    r"\b(?:and|also|what about|how about)\s+([A-Za-z][\w\s,\'-]+?)(?:\?|$)",
    re.IGNORECASE,
)
_NON_CITY_WORDS = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "thanks",
        "thank",
        "yes",
        "no",
        "ok",
        "okay",
        "help",
        "why",
        "what",
        "who",
        "when",
        "where",
        "how",
    }
)


def latest_user_message(history: list[dict[str, str]]) -> str:
    """Return only the most recent user message (not prior chat turns)."""
    for entry in reversed(history):
        if entry.get("role") == "user":
            return (entry.get("content") or "").strip()
    return ""


def _looks_like_city_only(message: str) -> bool:
    text = message.strip()
    if not text or len(text.split()) > 5:
        return False
    if not _CITY_ONLY.match(text):
        return False
    first_word = text.split()[0].lower()
    return first_word not in _NON_CITY_WORDS


def _chat_was_about_weather(history: list[dict[str, str]]) -> bool:
    for entry in history:
        role = entry.get("role")
        content = (entry.get("content") or "").strip()
        if role == "user" and (
            _WEATHER_KEYWORDS.search(content)
            or _CITY_IN_QUESTION.search(content)
            or _looks_like_city_only(content)
        ):
            return True
        if role == "assistant" and "forecast" in content.lower():
            return True
    return False


def is_weather_related(message: str, history: list[dict[str, str]] | None = None) -> bool:
    """True when the latest user message is a weather request (not general chat)."""
    text = message.strip()
    if not text:
        return False
    if _OFF_TOPIC.search(text):
        return False
    if _WEATHER_KEYWORDS.search(text):
        return True
    if _CITY_IN_QUESTION.search(text):
        return True
    if _CITY_BEFORE_WEATHER.search(text):
        return True
    if _looks_like_city_only(text):
        return True
    if history and _FOLLOW_UP.search(text):
        follow = _FOLLOW_UP_CITY.search(text)
        city = _clean_city(follow.group(1)) if follow else None
        if city and _chat_was_about_weather(history):
            return True
    return False


def format_agent_input(history: list[dict[str, str]]) -> str:
    """Turn chat turns into one string for the agent."""
    if not history:
        return ""
    if len(history) == 1:
        return history[0]["content"]

    lines: list[str] = []
    for entry in history[:-1]:
        role = entry.get("role")
        content = entry.get("content", "")
        if role == "user":
            lines.append(f"User: {content}")
        elif role == "assistant":
            lines.append(f"Assistant: {content}")

    last = history[-1]["content"]
    if history[-1].get("role") == "user":
        if lines:
            return "Previous conversation:\n" + "\n".join(lines) + f"\n\nCurrent question: {last}"
        return last
    return "\n".join(lines) + f"\n\nCurrent question: {last}"


def _clean_city(raw: str) -> str:
    city = raw.strip().strip("\"'`.,?!")
    city = re.sub(r"^(?:city|the)\s+", "", city, flags=re.IGNORECASE)
    return city.strip()


def _extract_city_regex(question: str) -> str | None:
    if _looks_like_city_only(question):
        return _clean_city(question)
    match = _CITY_IN_QUESTION.search(question)
    if match:
        return _clean_city(match.group(1))
    match = _CITY_BEFORE_WEATHER.search(question.strip())
    if match:
        return _clean_city(match.group(1))
    match = re.search(
        r"\b(?:in|for)\s+([A-Za-z][A-Za-z\s,\'-]{1,50}?)"
        r"(?:\s+(?:this|next|over|today|tomorrow|tonight)|\?|$|,|\.)",
        question,
        re.IGNORECASE,
    )
    if match and (
        _WEATHER_KEYWORDS.search(question)
        or _CITY_IN_QUESTION.search(question)
        or _CITY_BEFORE_WEATHER.search(question)
    ):
        return _clean_city(match.group(1))
    return None


class WeatherAgent:
    """Small LangChain agent: extract city → call tool once → summarize (fits gemma3:1b)."""

    def __init__(self, model_name: str):
        self.llm = ChatOllama(model=model_name, temperature=0)

    def _llm_text(self, prompt: str, config: RunnableConfig | None) -> str:
        response = self.llm.invoke([HumanMessage(content=prompt)], config=config)
        return (response.content or "").strip()

    def _extract_city(self, question: str, config: dict | None) -> str | None:
        city = _extract_city_regex(question)
        if city:
            return city

        prompt = EXTRACT_PROMPT.format(question=question)
        raw = self._llm_text(prompt, config)
        if not raw or raw.upper() == "NONE":
            return None
        return _clean_city(raw.split("\n", 1)[0])

    def _summarize(
        self, question: str, city: str, forecast: str, config: dict | None
    ) -> str:
        prompt = SUMMARIZE_PROMPT.format(
            rules=SUMMARY_RULES,
            question=question,
            city=city,
            forecast=forecast,
        )
        return self._llm_text(prompt, config)

    def invoke(
        self,
        inputs: dict,
        config: RunnableConfig | None = None,
        **kwargs,
    ) -> dict:
        history: list[dict[str, str]] = inputs.get("history") or []
        current = (inputs.get("current") or latest_user_message(history)).strip()
        context = inputs.get("input") or format_agent_input(history)
        invoke_config: RunnableConfig = config or kwargs.get("config") or {}

        prior_history = history[:-1] if history and history[-1].get("role") == "user" else history

        if not is_weather_related(current, prior_history):
            return {"output": IRRELEVANT_REPLY}

        city = self._extract_city(current, invoke_config)
        if not city:
            return {
                "output": (
                    "Which city should I look up? "
                    "For example: \"What's the weather in Tel Aviv this week?\""
                )
            }

        forecast = get_weekly_forecast.invoke({"city": city})
        answer = self._summarize(context, city, forecast, invoke_config)
        return {"output": answer}


def build_agent(model_name: str | None = None) -> WeatherAgent:
    model = model_name or os.getenv("OLLAMA_MODEL", "gemma3:1b")
    return WeatherAgent(model)


def chat(
    history: list[dict[str, str]],
    model_name: str | None = None,
    agent: WeatherAgent | None = None,
    **invoke_kwargs,
) -> str:
    runner = agent or build_agent(model_name)
    result = runner.invoke(
        {
            "history": history,
            "current": latest_user_message(history),
            "input": format_agent_input(history),
        },
        **invoke_kwargs,
    )
    return result["output"]


def ask(question: str, model_name: str | None = None, **invoke_kwargs) -> str:
    return chat([{"role": "user", "content": question}], model_name=model_name, **invoke_kwargs)


def run(city: str, model_name: str | None = None) -> str:
    return ask(
        f"What will the temperature be in {city} over the next week?",
        model_name=model_name,
    )


def main() -> None:
    if not os.getenv("OPENWEATHERMAP_API_KEY", "").strip():
        print("Error: set OPENWEATHERMAP_API_KEY in weather_agent/.env")
        print("Copy .env.example to .env and add your key from https://openweathermap.org/api")
        sys.exit(1)

    city = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else input("City: ").strip()
    if not city:
        print("Error: provide a city name.")
        sys.exit(1)

    print(f"\nFetching weekly forecast for {city}...\n")
    print(run(city))


if __name__ == "__main__":
    main()
