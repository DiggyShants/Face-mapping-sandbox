const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

let showMesh = true;
let showMask = false;

// --- IMAGE LOADING SETUP ---
let isImageLoaded = false;
const maskImage = new Image();

maskImage.onload = function() {
    console.log("SUCCESS: Lincoln image loaded!");
    isImageLoaded = true;
};

maskImage.onerror = function() {
    console.error("ERROR: Could not load image.");
    isImageLoaded = false;
};

maskImage.crossOrigin = "anonymous";
// Your working URL
maskImage.src = "https://diggyshants.github.io/Face-mapping-sandbox/assets/lincoln.png";
// ---------------------------

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw Video
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      
      // Toggle 1: The Mesh
      if (showMesh) {
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1}); 
        drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1, radius: 1}); 
      }

      // Toggle 2: The Lincoln Mask
      if (showMask) {
        // --- ANCHOR POINTS ---
        const nose = landmarks[1];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        
        // --- MOUTH POINTS (For Lip Sync) ---
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];

        // Calculate basic geometry
        const leX = leftEye.x * canvasElement.width;
        const leY = leftEye.y * canvasElement.height;
        const reX = rightEye.x * canvasElement.width;
        const reY = rightEye.y * canvasElement.height;

        const dx = reX - leX;
        const dy = reY - leY;
        const angle = Math.atan2(dy, dx);
        const eyeDist = Math.sqrt(dx*dx + dy*dy);
        const scale = eyeDist / 70; 

        // --- CALCULATE MOUTH OPENNESS ---
        // Distance between upper and lower lip
        const mouthDistX = (upperLip.x - lowerLip.x) * canvasElement.width;
        const mouthDistY = (upperLip.y - lowerLip.y) * canvasElement.height;
        const mouthOpenness = Math.sqrt(mouthDistX*mouthDistX + mouthDistY*mouthDistY);
        
        // Sensitivity: Multiply the openness to make the jaw drop more noticeably
        // We subtract a small "resting" distance (approx 5) so the mouth isn't always open
        let jawOffset = Math.max(0, (mouthOpenness * 4) - 20); 

        // --- DRAWING THE MASK ---
        canvasCtx.translate(nose.x * canvasElement.width, nose.y * canvasElement.height);
        canvasCtx.rotate(angle);
        canvasCtx.scale(scale, scale);

        if (isImageLoaded) {
            // SETTINGS: Adjust the Mask Size Here
            const maskWidth = 220;  // Was 300 (Smaller now)
            const maskHeight = 290; // Was 400 (Smaller now)
            const xOffset = -maskWidth / 2; // Centers the image horizontally
            const yOffset = -maskHeight / 1.8; // Moves image up/down to align with nose

            // "THE NUTCRACKER" LOGIC
            // We split the image at 65% height (roughly where the mouth/beard starts)
            const splitY = maskImage.height * 0.65; 
            const splitDisplayY = maskHeight * 0.65;

            // 1. Draw TOP half (Head & Mustache) - Static
            canvasCtx.drawImage(
                maskImage, 
                0, 0, maskImage.width, splitY, // Source Cut (Top)
                xOffset, yOffset, maskWidth, splitDisplayY // Dest Placement
            );

            // 2. Draw BOTTOM half (Beard & Chin) - Moves with Jaw Offset
            canvasCtx.drawImage(
                maskImage,
                0, splitY, maskImage.width, maskImage.height - splitY, // Source Cut (Bottom)
                xOffset, yOffset + splitDisplayY + jawOffset, maskWidth, maskHeight - splitDisplayY // Dest Placement (Moved by jawOffset)
            );

        } else {
            // Fallback Red Box
            canvasCtx.strokeStyle = "red";
            canvasCtx.lineWidth = 5;
            canvasCtx.strokeRect(-50, -50, 100, 100);
        }

        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }
  canvasCtx.restore();
}

const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
}});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await faceMesh.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();

function toggleMesh() { showMesh = !showMesh; }
function toggleMask() { showMask = !showMask; }
