"""
Data Quality Oracle — DePIN Data Exchange

Scoring logic: freshness / accuracy / completeness per-record, plus an overall
weighted score. Used by the oracle daemon to push `update_quality` to the
Solana program, and available as a library for other tooling.
"""

from dataclasses import dataclass
import time
from typing import Iterable

MAX_STALENESS_SECONDS = 3600
MIN_GPS_ACCURACY_METERS = 10.0
MIN_RECORDS_FOR_SCORE = 5


@dataclass
class QualityReport:
    data_type: str
    freshness: int       # 0-100
    accuracy: int        # 0-100
    completeness: int    # 0-100
    overall: int         # 0-100
    issues: list


def _ts_of(record: dict) -> int:
    # support both new ("ts") and legacy ("timestamp") layouts
    return int(record.get("ts") or record.get("timestamp") or 0)


def _age_seconds(records: Iterable[dict]) -> float:
    now_ms = time.time() * 1000
    latest = max((_ts_of(r) for r in records), default=0)
    return max(0.0, (now_ms - latest) / 1000.0)


def _freshness(records: Iterable[dict]) -> float:
    age = _age_seconds(records)
    if age <= MAX_STALENESS_SECONDS:
        return 100.0
    return max(0.0, 100.0 - (age - MAX_STALENESS_SECONDS) / 36.0)


def _completeness(records: list[dict], required: set[str]) -> float:
    if not records:
        return 0.0
    missing = sum(1 for r in records if required - set(r.keys()))
    ratio = 1 - missing / len(records)
    score = 100.0 * ratio
    if len(records) < MIN_RECORDS_FOR_SCORE:
        score *= 0.7
    return max(0.0, score)


def score_gps(records: list[dict]) -> QualityReport:
    issues = []
    accuracies = [float(r.get("accuracy", 999)) for r in records]
    avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 999.0

    if avg_accuracy <= 2:
        accuracy = 100.0
    elif avg_accuracy <= MIN_GPS_ACCURACY_METERS:
        accuracy = 100 - (avg_accuracy - 2) / 8 * 30
    else:
        accuracy = max(0.0, 70 - (avg_accuracy - 10) * 5)
        issues.append(f"avg GPS accuracy {avg_accuracy:.1f}m above 10m threshold")

    freshness = _freshness(records)
    completeness = _completeness(records, {"lat", "lng"})
    overall = freshness * 0.3 + accuracy * 0.4 + completeness * 0.3
    return QualityReport("GPS", int(freshness), int(accuracy), int(completeness), int(overall), issues)


def score_weather(records: list[dict]) -> QualityReport:
    issues = []
    accuracy = 100.0
    for r in records:
        temp = r.get("temperature_c", r.get("temp"))
        if temp is not None and (temp < -60 or temp > 60):
            accuracy -= 20
            issues.append(f"suspicious temperature {temp}")
        humidity = r.get("humidity_pct", r.get("humidity"))
        if humidity is not None and (humidity < 0 or humidity > 100):
            accuracy -= 20
            issues.append(f"invalid humidity {humidity}")
    accuracy = max(0.0, accuracy)
    freshness = _freshness(records)
    completeness = _completeness(
        records,
        {"temperature_c", "humidity_pct"} if records and "temperature_c" in records[0] else {"temp", "humidity"},
    )
    overall = freshness * 0.3 + accuracy * 0.4 + completeness * 0.3
    return QualityReport("Weather", int(freshness), int(accuracy), int(completeness), int(overall), issues)


def score_network(records: list[dict]) -> QualityReport:
    issues = []
    accuracy = 100.0
    for r in records:
        uptime = r.get("uptime_pct", r.get("uptime", 0))
        if uptime < 0 or uptime > 100:
            accuracy -= 25
            issues.append(f"invalid uptime {uptime}")
        latency = r.get("latency_ms", 0)
        if latency < 0 or latency > 10000:
            accuracy -= 15
            issues.append(f"suspicious latency {latency}ms")
    accuracy = max(0.0, accuracy)
    freshness = _freshness(records)
    completeness = _completeness(
        records,
        {"uptime_pct", "latency_ms"} if records and "uptime_pct" in records[0] else {"uptime", "latency_ms"},
    )
    overall = freshness * 0.3 + accuracy * 0.4 + completeness * 0.3
    return QualityReport("Network", int(freshness), int(accuracy), int(completeness), int(overall), issues)


def score_camera(records: list[dict]) -> QualityReport:
    issues = []
    freshness = _freshness(records)
    required = {"device", "frame", "resolution"}
    completeness = _completeness(records, required)
    # Accuracy here is a proxy for coverage distance sanity.
    distances = [float(r.get("coverage_km", 0)) for r in records]
    if distances and any(d < 0 or d > 10 for d in distances):
        accuracy = 60.0
        issues.append("coverage_km out of sane range")
    else:
        accuracy = 92.0
    overall = freshness * 0.3 + accuracy * 0.4 + completeness * 0.3
    return QualityReport("Camera", int(freshness), int(accuracy), int(completeness), int(overall), issues)


SCORERS = {
    "GPS": score_gps,
    "Weather": score_weather,
    "Network": score_network,
    "Camera": score_camera,
}


def score(data_type: str, records: list[dict]) -> QualityReport:
    scorer = SCORERS.get(data_type)
    if scorer is None:
        return QualityReport(data_type, 0, 0, 0, 0, [f"unknown data type {data_type}"])
    return scorer(records)


if __name__ == "__main__":
    demo = [
        {"lat": 37.7749, "lng": -122.4194, "accuracy": 3.2, "ts": int(time.time() * 1000)},
        {"lat": 37.7751, "lng": -122.4183, "accuracy": 2.8, "ts": int(time.time() * 1000) - 60_000},
    ]
    report = score("GPS", demo)
    print(report)
