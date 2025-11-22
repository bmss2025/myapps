// -------------------------------------------------------------------------------------------
//   GLOBAL VARIABLES
// -------------------------------------------------------------------------------------------

let player, map;
let routeCoords = [], cumulativeDist = [], timePoints = [], landmarks = [];
let loadedData = null, videoId = null;
let autoPanEnabled = true;
let initialDist = 0;
let initialPos = null;
let marker = null; // ensure this exists globally
// --------------------------------------------------------------------------------------------

// ===== Load Project =====
document.getElementById('loadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('jsonFileInput');
  const videoInput = document.getElementById('videoIdInput');

  if (!fileInput.files.length) return alert('Please select a JSON file.');
  videoId = videoInput.value.trim();
  if (!videoId) return alert('Please enter a YouTube video ID.');

  const file = fileInput.files[0];
  const text = await file.text();
  loadedData = JSON.parse(text);

  if (map) map.remove();
  routeCoords = [];
  cumulativeDist = [];
  timePoints = [];
  landmarks = [];

  initMap();
  loadData(loadedData);
  loadYouTubePlayer(videoId);
});

// ===== YouTube =====
function loadYouTubePlayer(id) {
  if (player) player.destroy();
  player = new YT.Player('player', {
    width: '100%',
    height: '100%',
    videoId: id,
    playerVars: { controls: 1 },
    events: { onReady: onPlayerReady }
  });
}

function onPlayerReady(event) {
  setupVisualization();

  try {
    updateLabel(player.getCurrentTime());
  } catch (err) {
    console.warn("Label update failed:", err);
  }

  // Start marker sync loop
  requestAnimationFrame(syncMarker);

  // Track play/pause for autopan
  player.addEventListener('onStateChange', (e) => {
    if (e.data === YT.PlayerState.PLAYING) {
      autoPanEnabled = true;
    } else if (e.data === YT.PlayerState.PAUSED) {
      autoPanEnabled = false;
    }
  });
}

// --------------------------------------------------------------------------------------------
// MAP SECTION
// --------------------------------------------------------------------------------------------
function initMap() {
  map = L.map('map').setView([22.646, 88.433], 13);
  L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 19 }).addTo(map);
}

// -- Load Data --------------------------------------------------------------------------------
function loadData(data) {
  // === ROUTE ===
  const coords = data.geojson.features[0].geometry.coordinates;
  routeCoords = coords.map(c => [c[1], c[0]]);

  // cumulative distances
  cumulativeDist = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    const d = map.distance(routeCoords[i - 1], routeCoords[i]);
    cumulativeDist.push(cumulativeDist[i - 1] + d);
  }

  // === LINKED POINTS ===
  timePoints = (data.linkedPoints || []).map(p => ({
    time: Number(p.time),
    lat: p.position[0],
    lon: p.position[1],
    dist: findNearestDistanceOnRoute([p.position[0], p.position[1]])
  }));

  // ensure linkedPoints sorted
  timePoints.sort((a, b) => a.time - b.time);

  // === LANDMARKS ===
  landmarks = data.landmarks || [];

  // === FIX A: force timePoints[0] to match landmark[0] ===
  if (landmarks.length > 0 && timePoints.length > 0) {
    const lm0 = landmarks[0];
    const nearest = findNearestPointOnRoute([lm0.lat, lm0.lon]);

    timePoints[0].dist = nearest.dist;
    timePoints[0].time = lm0.time;   // usually 0 or whatever is saved
  }

  // === START POSITION ===
  if (data.startPosition) {
    initialPos = [data.startPosition.lat, data.startPosition.lon];
    initialDist = findNearestDistanceOnRoute(initialPos);
  } else if (landmarks.length > 0) {
    initialPos = [landmarks[0].lat, landmarks[0].lon];
    initialDist = findNearestDistanceOnRoute(initialPos);
  } else if (timePoints.length > 0) {
    initialPos = [timePoints[0].lat, timePoints[0].lon];
    initialDist = timePoints[0].dist;
  } else {
    initialPos = routeCoords[0];
    initialDist = 0;
  }
}

// -------------------------------------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------------------------------------
function findNearestDistanceOnRoute(position) {
  const [lat, lon] = position;
  let nearestDist = Infinity, bestCumDist = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const a = routeCoords[i - 1], b = routeCoords[i];
    const d = pointToSegmentDistance([lat, lon], a, b);
    if (d.dist < nearestDist) {
      nearestDist = d.dist;
      bestCumDist = cumulativeDist[i - 1] + d.frac * (cumulativeDist[i] - cumulativeDist[i - 1]);
    }
  }
  return bestCumDist;
}

function findNearestPointOnRoute(position) {
  const [lat, lon] = position;
  let nearestDist = Infinity, bestPoint = routeCoords[0], bestCumDist = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const a = routeCoords[i - 1], b = routeCoords[i];
    const d = pointToSegmentDistance([lat, lon], a, b);
    if (d.dist < nearestDist) {
      nearestDist = d.dist;
      const latN = a[0] + d.frac * (b[0] - a[0]);
      const lonN = a[1] + d.frac * (b[1] - a[1]);
      bestPoint = [latN, lonN];
      bestCumDist = cumulativeDist[i - 1] + d.frac * (cumulativeDist[i] - cumulativeDist[i - 1]);
    }
  }
  return { point: bestPoint, dist: bestCumDist };
}

function pointToSegmentDistance(p, a, b) {
  const x = p[1], y = p[0];
  const x1 = a[1], y1 = a[0], x2 = b[1], y2 = b[0];
  const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D, lenSq = C * C + D * D;
  const frac = Math.max(0, Math.min(1, dot / lenSq));
  const projX = x1 + frac * C, projY = y1 + frac * D;
  const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2) * 111320;
  return { dist, frac };
}

function getPositionAtDistance(targetDist) {
  if (routeCoords.length < 2) return routeCoords[0];
  let i = 1;
  while (i < cumulativeDist.length && cumulativeDist[i] < targetDist) i++;
  if (i >= cumulativeDist.length) return routeCoords.at(-1);
  const a = routeCoords[i - 1], b = routeCoords[i];
  const segDist = cumulativeDist[i] - cumulativeDist[i - 1];
  const segFrac = (targetDist - cumulativeDist[i - 1]) / segDist;
  return [a[0] + segFrac * (b[0] - a[0]), a[1] + segFrac * (b[1] - a[1])];
}

function distanceToTime(d) {
  if (timePoints.length < 2) return 0;
  for (let i = 1; i < timePoints.length; i++) {
    const prev = timePoints[i - 1], next = timePoints[i];
    if (d >= prev.dist && d <= next.dist) {
      const frac = (d - prev.dist) / (next.dist - prev.dist);
      return prev.time + frac * (next.time - prev.time);
    }
  }
  if (d < timePoints[0].dist) return timePoints[0].time;
  if (d > timePoints.at(-1).dist) return timePoints.at(-1).time;
  return 0;
}

function interpolateDistanceForTime(t) {
  if (t <= timePoints[0].time) return timePoints[0].dist;
  if (t >= timePoints.at(-1).time) return timePoints.at(-1).dist;
  if (timePoints.length < 2) return 0;
  for (let i = 1; i < timePoints.length; i++) {
    const prev = timePoints[i - 1], next = timePoints[i];
    if (t >= prev.time && t <= next.time) {
      const frac = (t - prev.time) / (next.time - prev.time);
      return prev.dist + frac * (next.dist - prev.dist);
    }
  }
  if (t < timePoints[0].time) return timePoints[0].dist;
  if (t > timePoints.at(-1).time) return timePoints.at(-1).dist;
  return 0;
}

//  -------------------------------------------------------------------------------------------
// Two-way Sync & Map Visualization
// --------------------------------------------------------------------------------------------
function setupVisualization() {

  // === DRAW LANDMARKS ===
  landmarks.forEach(lm => {
    L.circleMarker([lm.lat, lm.lon], {
      radius: 4,
      color: 'red'
    })
    .addTo(map)
    .bindTooltip(lm.description);
  });

  // === DRAW ROUTE ===
  const polyline = L.polyline(routeCoords, { color: 'red', weight: 4 }).addTo(map);

  polyline.on('click', (e) => {
    const nearest = findNearestPointOnRoute([e.latlng.lat, e.latlng.lng]);
    marker.setLatLng(nearest.point);
    const t = distanceToTime(nearest.dist);
    player.seekTo(t, true);
  });

  // === CURSOR ICON ===
  const carIcon = L.divIcon({
    className: '',
    html: '<div class="car-marker"><i class="fa-solid fa-car-side"></i></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  // === FORCE START EXACTLY AT LANDMARK[0] ===
  let startPoint;

  if (landmarks.length > 0) {
    startPoint = [landmarks[0].lat, landmarks[0].lon];

    // but we still compute initialDist used for interpolation
    initialDist = findNearestPointOnRoute(startPoint).dist;

  } else {
    startPoint = routeCoords[0];
    initialDist = 0;
  }

  // === CREATE OR RESET MARKER ===
  if (!marker) {
    marker = L.marker(startPoint, { icon: carIcon }).addTo(map);
  } else {
    marker.setLatLng(startPoint);
  }

  // === INITIAL VIEW ===
  map.setView(startPoint, 15);
}

// ---------------------------------------------------------------------
//   Video → Map Sync
// ---------------------------------------------------------------------
function syncMarker() {
  if (!player || !marker || routeCoords.length === 0) {
    requestAnimationFrame(syncMarker);
    return;
  }

  const t = player.getCurrentTime();

  // If we have at least one landmark, and video time is before the first landmark's time,
  // keep the marker at initialDist (the landmark) until the video reaches that time.
  let d;
  if (landmarks.length > 0 && typeof landmarks[0].time === 'number' && t < landmarks[0].time) {
    d = initialDist;
  } else {
    d = interpolateDistanceForTime(t);
  }

  const pos = getPositionAtDistance(d);
  marker.setLatLng(pos);

  if (autoPanEnabled) {
    map.panTo(pos, { animate: true });
  }

  updateLabel(t);
  requestAnimationFrame(syncMarker);
}


// Custom File Upload Display -----------------------------------------------------------
const jsonInput = document.getElementById('jsonFileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');

jsonInput.addEventListener('change', () => {
  if (jsonInput.files.length > 0) {
    fileNameDisplay.textContent = jsonInput.files[0].name;
    fileNameDisplay.style.color = '#fff'; // make visible and prominent
  } else {
    fileNameDisplay.textContent = 'No file selected';
    fileNameDisplay.style.color = '#ccc';
  }
});

// Update Label --------------------------------------------------------------------------
function updateLabel(currentTime) {
  const box = document.getElementById("labelDisplay");
  if (!box) return;

  if (!landmarks || landmarks.length === 0) {
    box.style.opacity = 0;
    return;
  }

  // apply the measured offset
  const offset = 0;
  const correctedTime = currentTime - offset;

  // relaxed match threshold (2 seconds)
  const lm = landmarks.find(l =>
    Math.abs(l.time - correctedTime) < 2
  );

  if (lm) {
    box.innerText = lm.description;
    box.style.opacity = 1;
  } else {
    box.style.opacity = 0;
  }
}
