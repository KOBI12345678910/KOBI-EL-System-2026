"""
Geospatial Engine — location-aware queries over entities with
lat/lon properties.

Reads entities whose properties include `latitude`, `longitude`,
`lat/lng`, `coordinates`, `location`, or similar and provides:

  - point_in_radius(lat, lon, radius_km)
  - nearest(lat, lon, limit)
  - bounding_box(min_lat, max_lat, min_lon, max_lon)
  - cluster_by_density(precision_km)  — simple grid clustering
  - distance_km(p1, p2)                — Haversine

No external dependencies — pure math.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


EARTH_RADIUS_KM = 6371.0


@dataclass
class GeoPoint:
    entity_id: str
    entity_type: str
    name: str
    latitude: float
    longitude: float
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GeoQueryResult:
    center_lat: float
    center_lon: float
    radius_km: float
    matches: List[GeoPoint]
    count: int


@dataclass
class GeoCluster:
    cluster_id: str
    center_lat: float
    center_lon: float
    count: int
    entity_ids: List[str]


class GeospatialEngine:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _extract_points(self, tenant_id: str) -> List[GeoPoint]:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        points: List[GeoPoint] = []
        for obj in objects:
            try:
                props = json.loads(obj.properties_json or "{}")
            except Exception:
                continue
            coords = self._extract_coords(props)
            if coords is None:
                continue
            lat, lon = coords
            points.append(GeoPoint(
                entity_id=obj.id,
                entity_type=obj.object_type,
                name=obj.name,
                latitude=lat,
                longitude=lon,
                properties=props,
            ))
        return points

    def _extract_coords(self, props: Dict[str, Any]) -> Optional[Tuple[float, float]]:
        # Try common field combinations
        lat = (
            props.get("latitude")
            or props.get("lat")
            or (props.get("coordinates", {}).get("lat") if isinstance(props.get("coordinates"), dict) else None)
        )
        lon = (
            props.get("longitude")
            or props.get("lon")
            or props.get("lng")
            or (props.get("coordinates", {}).get("lon") if isinstance(props.get("coordinates"), dict) else None)
        )
        if lat is None or lon is None:
            return None
        try:
            return float(lat), float(lon)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Haversine distance between two points in kilometers."""
        r = EARTH_RADIUS_KM
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c

    def point_in_radius(
        self,
        *,
        tenant_id: str,
        lat: float,
        lon: float,
        radius_km: float,
    ) -> GeoQueryResult:
        points = self._extract_points(tenant_id)
        matches = [
            p for p in points
            if self.distance_km(lat, lon, p.latitude, p.longitude) <= radius_km
        ]
        return GeoQueryResult(
            center_lat=lat,
            center_lon=lon,
            radius_km=radius_km,
            matches=matches,
            count=len(matches),
        )

    def nearest(
        self,
        *,
        tenant_id: str,
        lat: float,
        lon: float,
        limit: int = 5,
    ) -> List[GeoPoint]:
        points = self._extract_points(tenant_id)
        scored = [
            (self.distance_km(lat, lon, p.latitude, p.longitude), p)
            for p in points
        ]
        scored.sort(key=lambda x: x[0])
        return [p for _, p in scored[:limit]]

    def bounding_box(
        self,
        *,
        tenant_id: str,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
    ) -> List[GeoPoint]:
        points = self._extract_points(tenant_id)
        return [
            p for p in points
            if min_lat <= p.latitude <= max_lat and min_lon <= p.longitude <= max_lon
        ]

    def cluster_by_density(
        self,
        *,
        tenant_id: str,
        precision_km: float = 10.0,
    ) -> List[GeoCluster]:
        """Simple grid clustering — points in the same N-km grid cell."""
        points = self._extract_points(tenant_id)
        # Convert precision_km to degrees (approx: 1 deg lat ≈ 111 km)
        degree_step = precision_km / 111.0
        cells: Dict[Tuple[int, int], List[GeoPoint]] = {}
        for p in points:
            cell = (int(p.latitude / degree_step), int(p.longitude / degree_step))
            cells.setdefault(cell, []).append(p)

        clusters: List[GeoCluster] = []
        for i, (cell, members) in enumerate(cells.items()):
            avg_lat = sum(p.latitude for p in members) / len(members)
            avg_lon = sum(p.longitude for p in members) / len(members)
            clusters.append(GeoCluster(
                cluster_id=f"geocluster_{i}",
                center_lat=round(avg_lat, 6),
                center_lon=round(avg_lon, 6),
                count=len(members),
                entity_ids=[p.entity_id for p in members],
            ))
        clusters.sort(key=lambda c: -c.count)
        return clusters

    def stats(self, tenant_id: str) -> Dict[str, Any]:
        points = self._extract_points(tenant_id)
        if not points:
            return {"total_geocoded": 0}
        lats = [p.latitude for p in points]
        lons = [p.longitude for p in points]
        by_type: Dict[str, int] = {}
        for p in points:
            by_type[p.entity_type] = by_type.get(p.entity_type, 0) + 1
        return {
            "total_geocoded": len(points),
            "by_entity_type": by_type,
            "bounding_box": {
                "min_lat": min(lats), "max_lat": max(lats),
                "min_lon": min(lons), "max_lon": max(lons),
            },
            "centroid": {
                "lat": sum(lats) / len(lats),
                "lon": sum(lons) / len(lons),
            },
        }
