const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

// --- STATE MANAGEMENT ---
let showMesh = true; // Toggle for the red wireframe
let currentMask = 'lincoln'; // 'lincoln', 'monalisa', 'blank'

// --- MASK CONFIGURATION ---
const masks = {
    lincoln: {
        src: "https://diggyshants.github.io/Face-mapping-sandbox/assets/lincoln.png",
        scale: 1.0
    },
    monalisa: {
        // REPLACE THIS URL with your Mona Lisa PNG
        src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/687px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg", 
        scale: 1.0
    },
    blank: {
        src: null,
        scale: 1.0
    }
};

// --- IMAGE LOADING LOGIC ---
let maskImage = new Image();
let isImageLoaded = false;
let isUVInitialized = false; // Flag to capture face shape once
let uvCoords = []; // Stores the texture coordinates (the face shape at rest)

// Load default
loadMask('lincoln');

function loadMask(maskName) {
    currentMask = maskName;
    isImageLoaded = false;
    isUVInitialized = false; // Reset mapping so we capture a new face shape
    
    if (maskName === 'blank') {
        console.log("Switched to Blank");
        return;
    }

    const config = masks[maskName];
    if (config && config.src) {
        maskImage = new Image();
        maskImage.crossOrigin = "anonymous";
        maskImage.src = config.src;
        
        maskImage.onload = function() {
            console.log(`SUCCESS: ${maskName} image loaded!`);
            isImageLoaded = true;
        };
        
        maskImage.onerror = function() {
            console.error(`ERROR: Could not load ${maskName}`);
        };
    }
}

// Function exposed to HTML buttons
window.switchMask = function(name) {
    loadMask(name);
};
window.toggleMesh = function() { showMesh = !showMesh; };


// --- MAIN RENDER LOOP ---
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 1. Draw Video Feed
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {
            
            // 2. Draw Wireframe (Debug)
            if (showMesh) {
                drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1}); 
            }

            // 3. Draw Mask (Texture Mapped)
            if (currentMask !== 'blank' && isImageLoaded) {
                drawFaceMeshTexture(canvasCtx, landmarks, maskImage);
            }
        }
    }
    canvasCtx.restore();
}

// --- TEXTURE MAPPING CORE ---

function drawFaceMeshTexture(ctx, landmarks, img) {
    // 1. CAPTURE UVs (Once per mask load)
    // We assume the user is facing the camera when the mask loads.
    // We map the image pixels to this specific face shape.
    if (!isUVInitialized) {
        uvCoords = [];
        for (let i = 0; i < landmarks.length; i++) {
            // Store normalized coordinates (0..1) based on image dimensions
            // We use the landmark positions directly as the UV map
            // Note: Ideally, you'd map to a standard 2D face mesh, but capturing 
            // the current face on frame 1 is a good shortcut for 2D images.
            uvCoords.push({
                u: landmarks[i].x * img.width,
                v: landmarks[i].y * img.height
            });
        }
        isUVInitialized = true;
        console.log("Face UVs Captured. Mask Mapped.");
    }

    // 2. DRAW TRIANGLES
    // Iterate through the triangulation array
    for (let i = 0; i < TRIANGULATION.length; i += 3) {
        const idx0 = TRIANGULATION[i];
        const idx1 = TRIANGULATION[i + 1];
        const idx2 = TRIANGULATION[i + 2];

        // Get the current face points (Destination)
        const p0 = landmarks[idx0];
        const p1 = landmarks[idx1];
        const p2 = landmarks[idx2];

        // Convert to canvas coordinates
        const x0 = p0.x * canvasElement.width;
        const y0 = p0.y * canvasElement.height;
        const x1 = p1.x * canvasElement.width;
        const y1 = p1.y * canvasElement.height;
        const x2 = p2.x * canvasElement.width;
        const y2 = p2.y * canvasElement.height;

        // Get the texture coordinates (Source from image)
        const uv0 = uvCoords[idx0];
        const uv1 = uvCoords[idx1];
        const uv2 = uvCoords[idx2];

        // Draw the warped triangle
        drawTriangle(ctx, img, 
            uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v, 
            x0, y0, x1, y1, x2, y2
        );
    }
}

// --- AFFINE TRANSFORM MATH ---
// Warps a triangle from the image to the canvas
function drawTriangle(ctx, im, x0, y0, x1, y1, x2, y2, X0, Y0, X1, Y1, X2, Y2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X0, Y0);
    ctx.lineTo(X1, Y1);
    ctx.lineTo(X2, Y2);
    ctx.closePath();
    ctx.clip(); // Only draw inside this triangle

    // Solve for the Affine Transform Matrix
    const denom = x0 * (y2 - y1) - x1 * y2 + x2 * y1 + (x1 - x2) * y0;
    if (Math.abs(denom) < 0.001) {
        ctx.restore();
        return; // Avoid divide by zero
    }

    const m11 = - (y0 * (X2 - X1) - y1 * X2 + y2 * X1 + (y1 - y2) * X0) / denom;
    const m12 = (y1 * Y2 + y0 * (Y1 - Y2) - y2 * Y1 + (y2 - y1) * Y0) / denom;
    const m21 = (x0 * (X2 - X1) - x1 * X2 + x2 * X1 + (x1 - x2) * X0) / denom;
    const m22 = - (x0 * (Y2 - Y1) - x1 * Y2 + x2 * Y1 + (x1 - x2) * Y0) / denom;
    const dx = (x0 * (y2 * X1 - y1 * X2) + x0 * (y1 - y2) * X0 + x1 * (y0 * X2 - y2 * X0) + x2 * (y1 * X0 - y0 * X1)) / denom;
    const dy = (x0 * (y2 * Y1 - y1 * Y2) + x0 * (y1 - y2) * Y0 + x1 * (y0 * Y2 - y2 * Y0) + x2 * (y1 * Y0 - y0 * Y1)) / denom;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
}

// --- INITIALIZATION ---
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


// --- TRIANGULATION DATA (Standard 468 point mesh) ---
// This tells the code which 3 points form a triangle.
// Derived from standard MediaPipe FaceMesh topology.
const TRIANGULATION = [
    127, 34, 139, 11, 0, 37, 37, 0, 267, 267, 0, 61, 185, 40, 39, 37, 267, 269, 37, 269, 270, 40, 185, 191, 185, 0, 11, 37, 270, 409, 270, 269, 409, 0, 37, 11, 37, 40, 185, 40, 270, 185, 270, 40, 92, 185, 11, 12, 12, 11, 13, 270, 92, 186, 92, 40, 39, 186, 92, 165, 92, 39, 37, 165, 92, 167, 186, 165, 12, 12, 165, 92, 13, 11, 14, 14, 11, 15, 15, 11, 16, 16, 11, 17, 17, 11, 186, 17, 186, 43, 43, 186, 12, 16, 17, 315, 16, 315, 316, 15, 16, 316, 15, 316, 317, 14, 15, 317, 14, 317, 146, 13, 14, 146, 13, 146, 91, 186, 92, 12, 186, 43, 57, 43, 12, 146, 92, 165, 91, 146, 12, 91, 91, 165, 12, 146, 106, 91, 91, 106, 182, 91, 182, 84, 17, 43, 106, 182, 106, 43, 43, 57, 214, 57, 186, 214, 214, 186, 83, 186, 17, 83, 83, 17, 18, 182, 83, 18, 182, 18, 315, 106, 43, 214, 214, 57, 106, 106, 57, 186, 18, 17, 315, 313, 18, 315, 315, 316, 403, 315, 403, 313, 313, 403, 404, 313, 404, 314, 314, 404, 321, 314, 321, 17, 17, 321, 375, 18, 313, 314, 17, 18, 314, 83, 18, 314, 57, 214, 192, 214, 83, 192, 83, 314, 192, 192, 314, 210, 210, 314, 17, 210, 17, 321, 214, 192, 210, 214, 210, 362, 362, 210, 321, 362, 321, 396, 362, 396, 323, 362, 323, 447, 214, 362, 447, 447, 323, 365, 447, 365, 265, 214, 447, 265, 265, 365, 379, 365, 323, 396, 379, 365, 396, 265, 379, 396, 13, 91, 181, 91, 84, 181, 84, 182, 181, 182, 315, 403, 181, 182, 403, 321, 404, 403, 13, 181, 403, 314, 13, 403, 314, 321, 404, 17, 375, 291, 17, 291, 321, 321, 291, 404, 291, 308, 404, 404, 308, 319, 404, 319, 403, 403, 319, 320, 314, 17, 291, 375, 321, 291, 291, 375, 306, 291, 306, 308, 308, 306, 292, 308, 292, 324, 308, 324, 318, 308, 318, 319, 319, 318, 402, 319, 402, 320, 320, 402, 13, 320, 13, 403, 13, 312, 317, 14, 317, 312, 13, 14, 312, 312, 320, 13, 312, 318, 320, 318, 324, 402, 320, 402, 324, 318, 324, 292, 308, 324, 306, 291, 61, 146, 291, 306, 291, 146, 306, 61, 185, 39, 37, 39, 84, 37, 84, 181, 37, 181, 84, 91, 106, 84, 17, 84, 37, 17, 37, 0, 267, 37, 267, 84, 267, 181, 84, 267, 269, 181, 181, 269, 405, 181, 405, 314, 405, 321, 314, 405, 269, 270, 269, 405, 405, 270, 321, 405, 321, 375, 270, 321, 270, 409, 321, 409, 270, 291, 409, 291, 375, 291, 306, 409, 291, 306, 61, 306, 61, 185, 306, 185, 40, 306, 40, 39, 306, 39, 37, 306, 37, 0, 306, 0, 11, 306, 11, 12, 306, 12, 165, 291, 146, 61, 165, 92, 167, 167, 92, 186, 167, 186, 57, 167, 57, 43, 167, 43, 106, 167, 106, 182, 167, 182, 84, 167, 84, 17, 167, 17, 314, 167, 314, 317, 167, 317, 402, 167, 402, 318, 167, 318, 324, 167, 324, 308, 167, 308, 292, 167, 292, 306, 167, 306, 165, 306, 12, 165, 310, 318, 324, 324, 292, 415, 324, 415, 310, 291, 308, 324, 291, 324, 310, 310, 415, 324, 291, 310, 311, 291, 311, 306, 292, 306, 308, 306, 311, 415, 311, 310, 415, 306, 311, 311, 415, 292, 292, 415, 324, 265, 396, 447, 447, 396, 323, 323, 396, 362, 323, 362, 447, 447, 362, 214, 214, 362, 210, 210, 362, 321, 210, 321, 375, 321, 409, 375, 409, 270, 375, 270, 269, 375, 269, 267, 375, 267, 0, 375, 0, 11, 375, 11, 12, 375, 12, 146, 375, 146, 91, 375, 91, 181, 375, 181, 84, 375, 84, 17, 375, 17, 314, 375, 314, 317, 375, 317, 402, 375, 402, 318, 375, 318, 324, 375, 324, 308, 375, 308, 292, 375, 292, 306, 375, 306, 291, 214, 192, 83, 192, 314, 83, 314, 17, 83, 17, 18, 83, 18, 315, 83, 315, 182, 83, 182, 84, 83, 84, 17, 409, 291, 146, 409, 146, 91, 409, 91, 181, 409, 181, 84, 409, 84, 37, 409, 37, 39, 409, 39, 40, 409, 40, 185, 409, 185, 61, 409, 61, 146, 185, 40, 39, 37, 0, 267, 0, 11, 37, 11, 12, 37, 12, 146, 37, 146, 91, 37, 91, 181, 37, 181, 84, 37, 84, 17, 37, 17, 314, 37, 314, 405, 37, 405, 269, 37, 269, 267,
    // --- LIP ZIPPER TRIANGLES (Closes the mouth hole) ---
    // Center
    13, 14, 87, 13, 87, 82, 13, 14, 317, 13, 317, 312,
    // Left
    82, 87, 178, 82, 178, 81, 81, 178, 88, 81, 88, 80, 80, 88, 95, 80, 95, 191, 191, 95, 78,
    // Right
    312, 317, 402, 312, 402, 311, 311, 402, 318, 311, 318, 310, 310, 318, 324, 310, 324, 415, 415, 324, 308
];
