import os
from collections import defaultdict
from datetime import datetime, timezone

import requests
from langchain_core.tools import tool

GEOCODING_URL = "https://api.openweathermap.org/geo/1.0/direct"
ONE_CALL_URL = "https://api.openweathermap.org/data/3.0/onecall"
FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


def _api_key() -> str:
    key = os.getenv("OPENWEATHERMAP_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "OPENWEATHERMAP_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return key


def _geocode(city: str) -> tuple[str, float, float]:
    response = requests.get(
        GEOCODING_URL,
        params={"q": city, "limit": 1, "appid": _api_key()},
        timeout=15,
    )
    response.raise_for_status()
    results = response.json()
    if not results:
        raise ValueError(f"City not found: {city}")

    place = results[0]
    label = place.get("name", city)
    if place.get("country"):
        label = f"{label}, {place['country']}"
    return label, place["lat"], place["lon"]


def _format_day(date_str: str, day: dict) -> str:
    temp = day.get("temp", {})
    weather = day.get("weather", [{}])[0]
    description = weather.get("description", "unknown")
    min_c = temp.get("min")
    max_c = temp.get("max")
    day_c = temp.get("day")
    return (
        f"{date_str}: {description}, "
        f"day {day_c}°C, min {min_c}°C, max {max_c}°C"
    )


def _fetch_one_call_daily(label: str, lat: float, lon: float, days: int = 7) -> str | None:
    response = requests.get(
        ONE_CALL_URL,
        params={
            "lat": lat,
            "lon": lon,
            "exclude": "current,minutely,hourly,alerts",
            "units": "metric",
            "appid": _api_key(),
        },
        timeout=15,
    )
    if response.status_code == 401:
        raise ValueError("Invalid OpenWeatherMap API key.")
    if response.status_code != 200:
        return None

    daily = response.json().get("daily", [])[:days]
    if not daily:
        return None

    lines = [f"7-day forecast for {label} (OpenWeatherMap One Call API):"]
    for entry in daily:
        date_str = datetime.fromtimestamp(entry["dt"], tz=timezone.utc).strftime("%A, %Y-%m-%d")
        lines.append(_format_day(date_str, entry))
    return "\n".join(lines)


def _fetch_five_day_aggregate(label: str, lat: float, lon: float) -> str:
    response = requests.get(
        FORECAST_URL,
        params={"lat": lat, "lon": lon, "units": "metric", "appid": _api_key()},
        timeout=15,
    )
    response.raise_for_status()
    entries = response.json().get("list", [])
    if not entries:
        raise ValueError(f"No forecast data returned for {label}.")

    by_day: dict[str, list[float]] = defaultdict(list)
    descriptions: dict[str, str] = {}
    for entry in entries:
        dt = datetime.fromtimestamp(entry["dt"], tz=timezone.utc)
        day_key = dt.strftime("%A, %Y-%m-%d")
        by_day[day_key].append(entry["main"]["temp"])
        descriptions[day_key] = entry["weather"][0].get("description", "unknown")

    lines = [
        f"5-day forecast for {label} (OpenWeatherMap free tier, aggregated from 3-hour data):",
        "Note: full 7-day daily forecast requires One Call API 3.0 on your OpenWeatherMap account.",
    ]
    for day_key in sorted(by_day.keys()):
        temps = by_day[day_key]
        lines.append(
            f"{day_key}: {descriptions[day_key]}, "
            f"min {min(temps):.1f}°C, max {max(temps):.1f}°C, avg {sum(temps) / len(temps):.1f}°C"
        )
    return "\n".join(lines)


@tool
def get_weekly_forecast(city: str) -> str:
    """Get daily temperatures for a city over the next week using OpenWeatherMap.

    Use this when the user asks about weather, temperature, or forecast for a city.
    Input should be a city name, optionally with country code (e.g. 'London,GB' or 'Tel Aviv').
    """
    city = city.strip()
    if not city:
        return "Please provide a city name."

    try:
        label, lat, lon = _geocode(city)
        forecast = _fetch_one_call_daily(label, lat, lon)
        if forecast:
            return forecast
        return _fetch_five_day_aggregate(label, lat, lon)
    except requests.HTTPError as exc:
        return f"OpenWeatherMap request failed: {exc}"
    except ValueError as exc:
        return str(exc)
    except requests.RequestException as exc:
        return f"Network error while contacting OpenWeatherMap: {exc}"
