package tiles

import (
	"encoding/json"
	"log"
	"math"
	"sort"
	"strings"

	"github.com/RailForLess/tracky/api/spec"
)

// maxGapDeg is the maximum gap in degrees between consecutive shape
// points before we split into a new line segment. ~0.35° ≈ 38.9 km.
const maxGapDeg = 0.35

// FeatureCollection is a minimal GeoJSON FeatureCollection.
type FeatureCollection struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

// Feature is a minimal GeoJSON Feature with string properties.
type Feature struct {
	Type       string            `json:"type"`
	Properties map[string]string `json:"properties"`
	Geometry   json.RawMessage   `json:"geometry"`
}

// lineStringGeometry is a GeoJSON LineString geometry.
type lineStringGeometry struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// multiLineStringGeometry is a GeoJSON MultiLineString geometry.
type multiLineStringGeometry struct {
	Type        string         `json:"type"`
	Coordinates [][][2]float64 `json:"coordinates"`
}

// pointGeometry is a GeoJSON Point geometry.
type pointGeometry struct {
	Type        string     `json:"type"`
	Coordinates [2]float64 `json:"coordinates"`
}

// BuildRouteGeoJSON builds only route geometry features.
func BuildRouteGeoJSON(
	shapes []spec.ShapePoint,
	trips []spec.Trip,
	routes []spec.Route,
) ([]byte, error) {
	features, err := buildRouteFeatures(shapes, trips, routes)
	if err != nil {
		return nil, err
	}

	fc := FeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return json.Marshal(fc)
}

// BuildStopGeoJSON builds only stop point features.
func BuildStopGeoJSON(stops []spec.Stop) ([]byte, error) {
	features, err := buildStopFeatures(stops)
	if err != nil {
		return nil, err
	}

	fc := FeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return json.Marshal(fc)
}

// BuildGeoJSON builds both route and stop features in one collection.
// This is primarily useful for local debug output.
func BuildGeoJSON(
	shapes []spec.ShapePoint,
	trips []spec.Trip,
	routes []spec.Route,
	stops []spec.Stop,
) ([]byte, error) {
	routeFeatures, err := buildRouteFeatures(shapes, trips, routes)
	if err != nil {
		return nil, err
	}
	stopFeatures, err := buildStopFeatures(stops)
	if err != nil {
		return nil, err
	}

	features := make([]Feature, 0, len(routeFeatures)+len(stopFeatures))
	features = append(features, routeFeatures...)
	features = append(features, stopFeatures...)

	fc := FeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return json.Marshal(fc)
}

func buildRouteFeatures(
	shapes []spec.ShapePoint,
	trips []spec.Trip,
	routes []spec.Route,
) ([]Feature, error) {
	// 1. Group shape points by composite key (providerID:shapeID),
	//    then sort each group by sequence.
	type shapeKey struct {
		providerID string
		shapeID    string
	}
	grouped := make(map[shapeKey][]spec.ShapePoint)
	for _, sp := range shapes {
		k := shapeKey{sp.ProviderID, sp.ShapeID}
		grouped[k] = append(grouped[k], sp)
	}
	for k, pts := range grouped {
		sort.Slice(pts, func(i, j int) bool {
			return pts[i].Sequence < pts[j].Sequence
		})
		grouped[k] = pts
	}

	// 2. Build route lookup by routeID.
	routeByID := make(map[string]spec.Route, len(routes))
	for _, r := range routes {
		routeByID[r.RouteID] = r
	}

	// 3. Build shape→route join via trips. Multiple routes can share a
	// shape, so collect every distinct routeID per shape rather than
	// keeping just the first one — otherwise later routes get dropped.
	// Trip.ShapeID is raw GTFS (not namespaced), so the join key is
	// providerID + ":" + *trip.ShapeID, matching our grouped keys.
	routesByShape := make(map[shapeKey]map[string]spec.Route)
	for _, t := range trips {
		if t.ShapeID == nil {
			continue
		}
		k := shapeKey{t.ProviderID, *t.ShapeID}
		route, ok := routeByID[t.RouteID]
		if !ok {
			continue
		}
		m, exists := routesByShape[k]
		if !exists {
			m = make(map[string]spec.Route)
			routesByShape[k] = m
		}
		m[route.RouteID] = route
	}

	// 4. Build features — one per (shape, route) pair.
	features := make([]Feature, 0, len(grouped))
	orphaned := 0
	for k, pts := range grouped {
		routesForShape, ok := routesByShape[k]
		if !ok || len(routesForShape) == 0 {
			orphaned++
			continue
		}

		// Build coordinate segments, splitting at large gaps.
		segments := [][][2]float64{{}}
		for i, p := range pts {
			coord := [2]float64{p.Lon, p.Lat} // GeoJSON is [lon, lat]
			if i > 0 {
				prev := pts[i-1]
				dlat := math.Abs(p.Lat - prev.Lat)
				dlon := math.Abs(p.Lon - prev.Lon)
				if dlat > maxGapDeg || dlon > maxGapDeg {
					segments = append(segments, [][2]float64{})
				}
			}
			segments[len(segments)-1] = append(segments[len(segments)-1], coord)
		}

		// Drop any segments with fewer than 2 points (can't form a line).
		var valid [][][2]float64
		for _, seg := range segments {
			if len(seg) >= 2 {
				valid = append(valid, seg)
			}
		}
		if len(valid) == 0 {
			continue
		}

		var geom json.RawMessage
		if len(valid) == 1 {
			b, err := json.Marshal(lineStringGeometry{
				Type:        "LineString",
				Coordinates: valid[0],
			})
			if err != nil {
				return nil, err
			}
			geom = b
		} else {
			b, err := json.Marshal(multiLineStringGeometry{
				Type:        "MultiLineString",
				Coordinates: valid,
			})
			if err != nil {
				return nil, err
			}
			geom = b
		}

		for _, r := range routesForShape {
			c := r.Color
			if c == "" {
				c = "888888"
			}
			tc := r.TextColor
			if tc == "" {
				tc = "FFFFFF"
			}
			features = append(features, Feature{
				Type: "Feature",
				Properties: map[string]string{
					"provider_id": k.providerID,
					"route_id":    r.RouteID,
					"shape_id":    k.shapeID,
					"color":       "#" + c,
					"text_color":  "#" + tc,
					"short_name":  r.ShortName,
					"long_name":   r.LongName,
				},
				Geometry: geom,
			})
		}
	}

	if orphaned > 0 {
		log.Printf("tiles: skipped %d orphaned shapes (no matching trip/route)", orphaned)
	}
	log.Printf("tiles: built %d route features from %d shape groups", len(features), len(grouped))
	return features, nil
}

func buildStopFeatures(stops []spec.Stop) ([]Feature, error) {
	features := make([]Feature, 0, len(stops))
	for _, s := range stops {
		geom, err := json.Marshal(pointGeometry{
			Type:        "Point",
			Coordinates: [2]float64{s.Lon, s.Lat}, // GeoJSON is [lon, lat]
		})
		if err != nil {
			return nil, err
		}

		code := s.Code
		if code == "" {
			parts := strings.Split(s.StopID, ":")
			code = parts[len(parts)-1]
		}

		features = append(features, Feature{
			Type: "Feature",
			Properties: map[string]string{
				"provider_id": s.ProviderID,
				"stop_id":     s.StopID,
				"code":        code,
				"name":        s.Name,
			},
			Geometry: geom,
		})
	}

	log.Printf("tiles: built %d stop features", len(features))
	return features, nil
}
