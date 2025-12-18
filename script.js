const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

let showMesh = true;
let showMask = false;

// --- SAFETY FIX: IMAGE LOADING ---
let isImageLoaded = false; // The Safety Flag
const maskImage = new Image();

maskImage.onload = function() {
    console.log("SUCCESS: Lincoln image loaded!");
    console.log("Dimensions: " + maskImage.width + "x" + maskImage.height);
    isImageLoaded = true; // Only flip the switch when we are 100% sure
};

maskImage.onerror = function() {
    console.error("ERROR: Could not load image. Check the URL below:");
    console.error(maskImage.src);
    isImageLoaded = false;
};

// We use the DIRECT link to your GitHub file to avoid folder issues
maskImage.crossOrigin = "anonymous";
maskImage.src = "https://diggyshants.github.io/Face-mapping-sandbox/assets/lincoln.png";
// ---------------------------------

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

      // Toggle 2: The Mask
      if (showMask) {
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const nose = landmarks[1];

        const leX = leftEye.x * canvasElement.width;
        const leY = leftEye.y * canvasElement.height;
        const reX = rightEye.x * canvasElement.width;
        const reY = rightEye.y * canvasElement.height;

        const dx = reX - leX;
        const dy = reY - leY;
        const angle = Math.atan2(dy, dx);
        const eyeDist = Math.sqrt(dx*dx + dy*dy);
        const scale = eyeDist / 70; 

        canvasCtx.translate(nose.x * canvasElement.width, nose.y * canvasElement.height);
        canvasCtx.rotate(angle);
        canvasCtx.scale(scale, scale);

        // --- THE FIX: USE THE FLAG ---
        // We only try to draw if the "onload" function above fired successfully
        if (isImageLoaded) {
            try {
                // Adjust these numbers (-150, -200) to center the mask
                canvasCtx.drawImage(maskImage, -150, -200, 300, 400); 
            } catch (e) {
                console.warn("Draw failed, skipping frame");
            }
        } else {
            // Draw the Red Square if image is missing
            canvasCtx.strokeStyle = "red";
            canvasCtx.lineWidth = 5;
            canvasCtx.strokeRect(-50, -50, 100, 100);
            
            // Draw text to help debug
            canvasCtx.scale(1/scale, 1/scale); // Reset scale for text
            canvasCtx.fillStyle = "white";
            canvasCtx.font = "20px Arial";
            canvasCtx.fillText("Image Loading...", 0, -60);
        }
        // -----------------------------

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
