#!/usr/bin/env python3

import csv
import json
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


ROOT = Path(__file__).resolve().parents[1]
INPUT_CSV = ROOT / "public" / "data_centers_with_derived_columns.csv"
INPUT_GEOJSON = ROOT / "public" / "wri_usa.geojson"
OUTPUT_CSV = ROOT / "public" / "data_centers_with_derived_columns.csv"


def point_in_ring(x: float, y: float, ring: List[List[float]]) -> bool:
    inside = False
    if len(ring) < 3:
        return False

    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]

        intersects = ((yi > y) != (yj > y))
        if intersects:
            slope_x = (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
            if x < slope_x:
                inside = not inside
        j = i

    return inside


def point_in_polygon(x: float, y: float, polygon: List[List[List[float]]]) -> bool:
    if not polygon:
        return False

    exterior = polygon[0]
    if not point_in_ring(x, y, exterior):
        return False

    for hole in polygon[1:]:
        if point_in_ring(x, y, hole):
            return False

    return True


def polygon_bbox(polygon: List[List[List[float]]]) -> Tuple[float, float, float, float]:
    xs = [point[0] for ring in polygon for point in ring]
    ys = [point[1] for ring in polygon for point in ring]
    return min(xs), min(ys), max(xs), max(ys)


def parse_features(geojson_path: Path) -> List[Dict]:
    data = json.loads(geojson_path.read_text())
    parsed = []

    for feature in data["features"]:
        geometry = feature.get("geometry") or {}
        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []
        properties = feature.get("properties") or {}

        polygons: List[Dict] = []
        if geometry_type == "Polygon":
            polygons.append({
                "rings": coordinates,
                "bbox": polygon_bbox(coordinates),
            })
        elif geometry_type == "MultiPolygon":
            for polygon in coordinates:
                polygons.append({
                    "rings": polygon,
                    "bbox": polygon_bbox(polygon),
                })
        else:
            continue

        parsed.append({
            "bws_label": properties.get("bws_label"),
            "bws_score": properties.get("bws_score"),
            "polygons": polygons,
        })

    return parsed


def contains_point(feature: Dict, lon: float, lat: float) -> bool:
    for polygon in feature["polygons"]:
        min_x, min_y, max_x, max_y = polygon["bbox"]
        if lon < min_x or lon > max_x or lat < min_y or lat > max_y:
            continue

        if point_in_polygon(lon, lat, polygon["rings"]):
            return True

    return False


def assign_water_stress(rows: Iterable[Dict[str, str]], features: List[Dict]) -> List[Dict[str, str]]:
    updated_rows = []

    for row in rows:
        next_row = dict(row)
        next_row["bws_label"] = ""
        next_row["bws_score"] = ""

        try:
            lat = float(row["lat_num"] or row["lat"])
            lon = float(row["long_num"] or row["long"])
        except (TypeError, ValueError):
            updated_rows.append(next_row)
            continue

        for feature in features:
            if contains_point(feature, lon, lat):
                next_row["bws_label"] = feature["bws_label"] or ""
                next_row["bws_score"] = "" if feature["bws_score"] is None else str(feature["bws_score"])
                break

        updated_rows.append(next_row)

    return updated_rows


def main() -> None:
    features = parse_features(INPUT_GEOJSON)

    with INPUT_CSV.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    updated_rows = assign_water_stress(rows, features)

    for column in ["bws_label", "bws_score"]:
        if column not in fieldnames:
            fieldnames.append(column)

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

    matched = sum(1 for row in updated_rows if row["bws_label"])
    print(f"Matched water stress labels for {matched} of {len(updated_rows)} facilities.")


if __name__ == "__main__":
    main()
