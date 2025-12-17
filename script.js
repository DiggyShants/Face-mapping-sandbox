const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

// State variables to track what we are showing
let showMesh = true; // Start with the educational mesh
let showMask = false;

// Load the Lincoln Image
const maskImage = new Image();
maskImage.src = "assets/lincoln.png"; // Ensure this file exists in your repo!

function onResults(results) {
  // 1. Clear the canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // 2. Draw the raw video feed first
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      
      // MODE 1: THE EDUCATIONAL MESH
      if (showMesh) {
        // Draw the connecting lines (tesselation)
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, 
                       {color: '#C0C0C070', lineWidth: 1}); 
        // Draw the specific dots (landmarks)
        drawLandmarks(canvasCtx, landmarks, 
                      {color: '#FF0000', lineWidth: 1, radius: 1}); 
      }

      // MODE 2: THE "DEEPFAKE" MASK
      if (showMask) {
        // We need three points to anchor the mask: Left Eye, Right Eye, and Nose Tip
        // MediaPipe Landmark Indices: 33 (Left Eye inner), 263 (Right Eye inner), 1 (Nose Tip)
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const nose = landmarks[1];

        // Convert normalized coordinates (0-1) to pixel coordinates
        const leX = leftEye.x * canvasElement.width;
        const leY = leftEye.y * canvasElement.height;
        const reX = rightEye.x * canvasElement.width;
        const reY = rightEye.y * canvasElement.height;

        // Calculate Rotation (Angle between eyes)
        const dx = reX - leX;
        const dy = reY - leY;
        const angle = Math.atan2(dy, dx);

        // Calculate Scale (Distance between eyes)
        const eyeDist = Math.sqrt(dx*dx + dy*dy);
        // "300" is an arbitrary base width for the mask, we scale relative to eye distance
        const scale = eyeDist / 70; 

        // Draw the Mask Image
        canvasCtx.translate(nose.x * canvasElement.width, nose.y * canvasElement.height); // Move to nose
        canvasCtx.rotate(angle); // Rotate to match head tilt
        canvasCtx.scale(scale, scale); // Scale to match head distance

        // --- THE FIX IS HERE ---
        // Only draw if the image loaded successfully
        if (maskImage.complete && maskImage.naturalWidth !== 0) {
            canvasCtx.drawImage(maskImage, -150, -200, 300, 400); 
        } else {
            // Optional: Draw a red box placeholder so you know the math works even if the image fails
            canvasCtx.strokeStyle = "red";
            canvasCtx.lineWidth = 5;
            canvasCtx.strokeRect(-50, -50, 100, 100);
        }
        // -----------------------
        
        // Draw image centered on the nose (adjust -100, -150 to align your specific PNG)
        canvasCtx.drawImage(maskImage, -150, -200, 300, 400); 

        // Restore canvas state for the next frame
        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }
  canvasCtx.restore();
}

// Setup MediaPipe Face Mesh
const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Start the Camera
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await faceMesh.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();

// Button Logic
function toggleMesh() {
    showMesh = !showMesh;
}
function toggleMask() {
    showMask = !showMask;
}
