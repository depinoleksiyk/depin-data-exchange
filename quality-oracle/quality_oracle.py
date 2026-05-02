"""
Data Quality Oracle — DePIN Data Exchange

Validates data freshness, accuracy, and completeness.
Assigns quality scores to data listings.

Run: python quality_oracle.py
"""

import time
import logging
from dataclasses import dataclass

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("quality_oracle")

MAX_STALENESS_SECONDS = 3600  # data older than 1h gets penalty
MIN_GPS_ACCURACY_METERS = 10.0
MIN_RECORDS_FOR_SCORE = 5


@dataclass
class QualityReport:
    dataType: str
    freshnessScore: float    # 0-100
    accuracyScore: float     # 0-100
    completenessScore: float  # 0-100
    overallScore: float      # weighted average 0-100
    issues: list


def score_gps_data(records: list[dict]) -> QualityReport:
    """Score GPS data stream quality."""
    issues = []
    now = time.time() * 1000  # ms

    # Freshness: how recent is the latest record
    timestamps = [r.get("timestamp", 0) for r in records]
    latestTs = max(timestamps) if timestamps else 0
    ageSec = (now - latestTs) / 1000

    if ageSec > MAX_STALENESS_SECONDS:
        freshnessScore = max(0, 100 - (ageSec / 36))  # lose 1pt per 36s after threshold
        issues.append(f"Latest record is {ageSec:.0f}s old")
    else:
        freshnessScore = 100.0

    # Accuracy: GPS accuracy field
    accuracies = [r.get("accuracy", 999) for r in records]
    avgAccuracy = sum(accuracies) / len(accuracies) if accuracies else 999

    if avgAccuracy <= 2:
        accuracyScore = 100.0
    elif avgAccuracy <= MIN_GPS_ACCURACY_METERS:
        accuracyScore = 100 - ((avgAccuracy - 2) / 8 * 30)
    else:
        accuracyScore = max(0, 70 - (avgAccuracy - 10) * 5)
        issues.append(f"Average GPS accuracy {avgAccuracy:.1f}m exceeds threshold")

    # Completeness: required fields present
    requiredFields = {"lat", "lng", "timestamp", "source"}
    missingCount = 0
    for r in records:
        missing = requiredFields - set(r.keys())
        if missing:
            missingCount += 1
            issues.append(f"Record missing fields: {missing}")

    completenessScore = 100 * (1 - missingCount / max(len(records), 1))

    if len(records) < MIN_RECORDS_FOR_SCORE:
        completenessScore *= 0.7
        issues.append(f"Only {len(records)} records (min {MIN_RECORDS_FOR_SCORE} for full score)")

    overallScore = freshnessScore * 0.3 + accuracyScore * 0.4 + completenessScore * 0.3

    return QualityReport(
        dataType="GPS",
        freshnessScore=round(freshnessScore, 1),
        accuracyScore=round(accuracyScore, 1),
        completenessScore=round(completenessScore, 1),
        overallScore=round(overallScore, 1),
        issues=issues,
    )


def score_weather_data(records: list[dict]) -> QualityReport:
    """Score weather data stream quality."""
    issues = []
    now = time.time() * 1000

    timestamps = [r.get("timestamp", 0) for r in records]
    latestTs = max(timestamps) if timestamps else 0
    ageSec = (now - latestTs) / 1000
    freshnessScore = max(0, 100 - max(0, ageSec - MAX_STALENESS_SECONDS) / 36)

    # Accuracy: check for reasonable ranges
    accuracyScore = 100.0
    for r in records:
        temp = r.get("temp", None)
        if temp is not None and (temp < -60 or temp > 60):
            accuracyScore -= 20
            issues.append(f"Suspicious temperature: {temp}°C")
        humidity = r.get("humidity", None)
        if humidity is not None and (humidity < 0 or humidity > 100):
            accuracyScore -= 20
            issues.append(f"Invalid humidity: {humidity}%")

    accuracyScore = max(0, accuracyScore)

    requiredFields = {"temp", "humidity", "pressure", "timestamp", "station"}
    missingCount = sum(1 for r in records if requiredFields - set(r.keys()))
    completenessScore = 100 * (1 - missingCount / max(len(records), 1))

    overallScore = freshnessScore * 0.3 + accuracyScore * 0.4 + completenessScore * 0.3

    return QualityReport(
        dataType="Weather",
        freshnessScore=round(freshnessScore, 1),
        accuracyScore=round(accuracyScore, 1),
        completenessScore=round(completenessScore, 1),
        overallScore=round(overallScore, 1),
        issues=issues,
    )


def score_network_data(records: list[dict]) -> QualityReport:
    """Score network telemetry data quality."""
    issues = []
    now = time.time() * 1000

    timestamps = [r.get("timestamp", 0) for r in records]
    latestTs = max(timestamps) if timestamps else 0
    ageSec = (now - latestTs) / 1000
    freshnessScore = max(0, 100 - max(0, ageSec - MAX_STALENESS_SECONDS) / 36)

    accuracyScore = 100.0
    for r in records:
        uptime = r.get("uptime", 0)
        if uptime < 0 or uptime > 100:
            accuracyScore -= 25
            issues.append(f"Invalid uptime: {uptime}%")
        latency = r.get("latency_ms", 0)
        if latency < 0 or latency > 10000:
            accuracyScore -= 15
            issues.append(f"Suspicious latency: {latency}ms")

    accuracyScore = max(0, accuracyScore)

    requiredFields = {"uptime", "latency_ms", "bandwidth_mbps", "timestamp", "node"}
    missingCount = sum(1 for r in records if requiredFields - set(r.keys()))
    completenessScore = 100 * (1 - missingCount / max(len(records), 1))

    overallScore = freshnessScore * 0.3 + accuracyScore * 0.4 + completenessScore * 0.3

    return QualityReport(
        dataType="Network",
        freshnessScore=round(freshnessScore, 1),
        accuracyScore=round(accuracyScore, 1),
        completenessScore=round(completenessScore, 1),
        overallScore=round(overallScore, 1),
        issues=issues,
    )


SCORERS = {
    "GPS": score_gps_data,
    "Weather": score_weather_data,
    "Network": score_network_data,
}


def score_data(dataType: str, records: list[dict]) -> QualityReport:
    """Score data quality based on type."""
    scorer = SCORERS.get(dataType)
    if scorer is None:
        return QualityReport(
            dataType=dataType,
            freshnessScore=0,
            accuracyScore=0,
            completenessScore=0,
            overallScore=0,
            issues=[f"Unknown data type: {dataType}"],
        )
    return scorer(records)


if __name__ == "__main__":
    # Demo scoring with sample data
    gps_sample = [
        {"lat": 37.7749, "lng": -122.4194, "timestamp": time.time() * 1000, "accuracy": 3.2, "source": "test"},
        {"lat": 37.7751, "lng": -122.4183, "timestamp": time.time() * 1000 - 60000, "accuracy": 2.8, "source": "test"},
    ]

    report = score_gps_data(gps_sample)
    print(f"\nQuality Report: {report.dataType}")
    print(f"  Freshness:    {report.freshnessScore}/100")
    print(f"  Accuracy:     {report.accuracyScore}/100")
    print(f"  Completeness: {report.completenessScore}/100")
    print(f"  Overall:      {report.overallScore}/100")
    if report.issues:
        print(f"  Issues: {', '.join(report.issues)}")
