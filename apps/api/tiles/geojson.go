package tiles

import (
	"encoding/json"
	"log"
	"math"
	"sort"

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

// BuildGeoJSON takes shapes, trips, and routes from all providers and
// produces a GeoJSON FeatureCollection. Shapes are joined to routes
// via trips to pick up color and name properties.
func BuildGeoJSON(
	shapes []spec.ShapePoint,
	trips []spec.Trip,
	routes []spec.Route,
) ([]byte, error) {
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

	// 3. Build shape→route join via trips.
	// Trip.ShapeID is raw GTFS (not namespaced), so the join key is
	// providerID + ":" + *trip.ShapeID, matching our grouped keys.
	routeByShape := make(map[shapeKey]spec.Route)
	for _, t := range trips {
		if t.ShapeID == nil {
			continue
		}
		k := shapeKey{t.ProviderID, *t.ShapeID}
		if _, ok := routeByShape[k]; ok {
			continue // already have a route for this shape
		}
		if route, ok := routeByID[t.RouteID]; ok {
			routeByShape[k] = route
		}
	}

	// 4. Build features.
	features := make([]Feature, 0, len(grouped))
	orphaned := 0
	for k, pts := range grouped {
		route, ok := routeByShape[k]
		if !ok {
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

		color := route.Color
		if color == "" {
			color = "888888"
		}

		textColor := route.TextColor
		if textColor == "" {
			textColor = "FFFFFF"
		}

		features = append(features, Feature{
			Type: "Feature",
			Properties: map[string]string{
				"provider_id": k.providerID,
				"route_id":    route.RouteID,
				"shape_id":    k.shapeID,
				"color":       "#" + color,
				"text_color":  "#" + textColor,
				"short_name":  route.ShortName,
				"long_name":   route.LongName,
			},
			Geometry: geom,
		})
	}

	if orphaned > 0 {
		log.Printf("tiles: skipped %d orphaned shapes (no matching trip/route)", orphaned)
	}
	log.Printf("tiles: built %d GeoJSON features from %d shape groups", len(features), len(grouped))

	fc := FeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return json.Marshal(fc)
}
