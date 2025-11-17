// mapPreview.js — modular map viewer for GeoJSON with interactivity
const MapPreview = (() => {
  let map, layer, highlightLayer, clickCallback;

  function initMap() {
    map = L.map('map').setView([20, 80], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  }

  function loadGeoJSON(data, onClick) {
    if (!data) return;
    if (!map) initMap();
    if (layer) layer.remove();
    clickCallback = onClick;

    layer = L.geoJSON(data, {
      style: { color: '#0078d4', weight: 2, fillOpacity: 0.2 },
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 5, color: '#0078d4' }),
      onEachFeature: (feature, lyr) => {
        lyr.on('click', () => {
          highlightFeature(feature);
          if (typeof clickCallback === 'function') clickCallback(feature);
        });
      }
    }).addTo(map);

    // delay fit to ensure map container is ready
    setTimeout(() => {
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds);
      } catch (e) {
        map.setView([20, 80], 4);
      }
    }, 200);
  }

  function highlightFeature(feature) {
    if (!map) return;
    if (highlightLayer) highlightLayer.remove();
    highlightLayer = L.geoJSON(feature, {
      style: { color: 'red', weight: 3, fillOpacity: 0.3 },
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 6, color: 'red', weight: 3 })
    }).addTo(map);

    setTimeout(() => {
      try {
        map.fitBounds(highlightLayer.getBounds(), { maxZoom: 12 });
      } catch (e) {
        const coords = feature.geometry.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          map.setView([coords[1], coords[0]], 10);
        }
      }
    }, 150);
  }

  // 🧠 new method for resizing map when container changes
  function refresh() {
    if (map) map.invalidateSize();
  }

  return { loadGeoJSON, highlightFeature, refresh };
})();
