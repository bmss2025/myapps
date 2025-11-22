// === SCREEN RECORDER (Browser Window, Auto MP4 Conversion) ===

let mediaRecorder = null;
let recordedChunks = [];
let startTime = null;
let isRecording = false;

const startBtn = document.getElementById('recordMapBtn');
const stopBtn = document.getElementById('stopRecordMapBtn');

// Create or reuse live status overlay
let statusDiv = document.querySelector('#record-status-overlay');
if (!statusDiv) {
  statusDiv = document.createElement('div');
  statusDiv.id = 'record-status-overlay';
  statusDiv.style.position = 'absolute';
  statusDiv.style.bottom = '10px';
  statusDiv.style.right = '10px';
  statusDiv.style.padding = '6px 10px';
  statusDiv.style.background = 'rgba(0,0,0,0.6)';
  statusDiv.style.color = '#fff';
  statusDiv.style.borderRadius = '4px';
  statusDiv.style.fontSize = '13px';
  statusDiv.style.fontFamily = 'monospace';
  statusDiv.style.display = 'none';
  statusDiv.style.zIndex = 9999;
  document.body.appendChild(statusDiv);
}

startBtn.addEventListener('click', startScreenRecording);
stopBtn.addEventListener('click', stopScreenRecording);

async function startScreenRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false
    });

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = convertToMp4; // after stop, convert automatically

    mediaRecorder.start();
    startTime = Date.now();
    isRecording = true;
    statusDiv.style.display = 'block';
    startBtn.disabled = true;
    stopBtn.disabled = false;

    updateStatus();
    console.log('🎥 Screen recording started...');
  } catch (err) {
    alert('Screen capture cancelled or failed: ' + err);
  }
}

function stopScreenRecording() {
  if (!isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  statusDiv.style.display = 'none';
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

// === Convert .webm → .mp4 using FFmpeg.wasm ===
async function convertToMp4() {
  try {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const webmUrl = URL.createObjectURL(blob);

    statusDiv.style.display = 'block';
    statusDiv.innerText = '⏳ Converting to MP4... (please wait)';
    console.log('⏳ Converting .webm to .mp4...');

    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ log: false });
    await ffmpeg.load();

    const webmData = await fetchFile(blob);
    ffmpeg.FS('writeFile', 'input.webm', webmData);
    await ffmpeg.run('-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-movflags', 'faststart', 'output.mp4');

    const data = ffmpeg.FS('readFile', 'output.mp4');
    const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
    const mp4Url = URL.createObjectURL(mp4Blob);

    const a = document.createElement('a');
    a.href = mp4Url;
    a.download = 'map_recording.mp4';
    a.click();
    URL.revokeObjectURL(mp4Url);

    statusDiv.innerText = '✅ MP4 saved!';
    setTimeout(() => (statusDiv.style.display = 'none'), 3000);

    console.log('✅ Recording converted and saved as map_recording.mp4');
  } catch (err) {
    console.error('❌ Conversion failed:', err);
    alert('Conversion to MP4 failed. You can still use the .webm file.');
  }
}

// === STATUS DISPLAY ===
function updateStatus() {
  if (!isRecording) return;
  const elapsed = (Date.now() - startTime) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const hr = Math.floor(mins / 60);
  const minAdj = mins % 60;
  const durationText =
    hr > 0
      ? `${hr}:${minAdj.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;

  // ~540MB/hour at 1.2 Mbps
  const estMB = (elapsed / 3600) * 540;
  statusDiv.innerText = `REC ${durationText}  |  ≈${estMB.toFixed(1)} MB`;

  if (isRecording) requestAnimationFrame(updateStatus);
}
