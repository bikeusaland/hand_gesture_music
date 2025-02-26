// Global variables
let camera;
let hands;
let videoElement;
let canvasElement;
let canvasCtx;
let debugInfo;
let startButton;
let stopButton;
let instrumentSelect;

// Music variables
let synth;
let isPlaying = false;
let lastNoteTime = 0;
let currentNotes = [];
let lastFingerPositions = null;

// Notes for different scales
const scales = {
    cMajor: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    gMajor: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4'],
    fMajor: ['F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4'],
    dMinor: ['D3', 'E3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D4'],
    aMinor: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']
};

// Current scale
let currentScale = scales.cMajor;

// Instrument configurations
const instruments = {
    piano: {
        create: () => new Tone.Sampler({
            urls: {
                C4: "C4.mp3",
                "D#4": "Ds4.mp3",
                "F#4": "Fs4.mp3",
                A4: "A4.mp3",
            },
            baseUrl: "https://tonejs.github.io/audio/salamander/",
        }).toDestination(),
    },
    synth: {
        create: () => new Tone.PolySynth(Tone.Synth).toDestination(),
    },
    marimba: {
        // Use a synthesizer with marimba-like settings instead of samples
        create: () => new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3.01,
            modulationIndex: 14,
            oscillator: {
                type: "triangle"
            },
            envelope: {
                attack: 0.002,
                decay: 0.5,
                sustain: 0.1,
                release: 1.2
            },
            modulation: {
                type: "square"
            },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.4,
                release: 0.5
            }
        }).toDestination()
    },
    guitar: {
        // Use a synthesizer with guitar-like settings instead of samples
        create: () => new Tone.PolySynth(Tone.AMSynth, {
            harmonicity: 2.5,
            oscillator: {
                type: "fatsawtooth"
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.3,
                release: 1.2
            },
            modulation: {
                type: "square"
            },
            modulationEnvelope: {
                attack: 0.5,
                decay: 0,
                sustain: 1,
                release: 0.5
            }
        }).toDestination()
    },
    bass: {
        // Use a synthesizer with bass-like settings instead of samples
        create: () => new Tone.MonoSynth({
            oscillator: {
                type: "fmsquare5",
                modulationType: "triangle",
                modulationIndex: 2,
                harmonicity: 0.501
            },
            filter: {
                Q: 1,
                type: "lowpass",
                rolloff: -24
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.4,
                release: 0.5
            },
            filterEnvelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.8,
                release: 0.5,
                baseFrequency: 50,
                octaves: 4.4
            }
        }).toDestination()
    }
};

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupEventListeners();
    initializeHandTracking();
});

// Initialize DOM elements
function initializeElements() {
    videoElement = document.getElementById('webcam');
    canvasElement = document.getElementById('output-canvas');
    canvasCtx = canvasElement.getContext('2d');
    debugInfo = document.getElementById('debug-info');
    startButton = document.getElementById('start-btn');
    stopButton = document.getElementById('stop-btn');
    instrumentSelect = document.getElementById('instrument-select');
}

// Set up event listeners
function setupEventListeners() {
    startButton.addEventListener('click', startCamera);
    stopButton.addEventListener('click', stopCamera);
    instrumentSelect.addEventListener('change', changeInstrument);
}

// Initialize hand tracking with MediaPipe
function initializeHandTracking() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });
}

// Start the camera
function startCamera() {
    // Start Tone.js audio context first
    Tone.start().then(() => {
        console.log('Audio context started');
        
        // Initialize the selected instrument
        changeInstrument();
        
        // Start the camera
        camera.start()
            .then(() => {
                startButton.disabled = true;
                stopButton.disabled = false;
                console.log('Camera started');
            })
            .catch(error => {
                console.error('Error starting camera:', error);
                alert('Error starting camera. Please make sure you have granted camera permissions.');
            });
    }).catch(error => {
        console.error('Could not start audio context:', error);
        alert('Error starting audio. Please try again by clicking the button.');
    });
}

// Stop the camera
function stopCamera() {
    camera.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
    
    // Stop any playing notes
    if (synth) {
        synth.releaseAll();
    }
    
    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    console.log('Camera stopped');
}

// Change the instrument
function changeInstrument() {
    const selectedInstrument = instrumentSelect.value;
    
    // Release any playing notes if synth exists
    if (synth) {
        // Make sure to properly release notes for both types of synths
        if (synth.releaseAll) {
            synth.releaseAll();
        } else if (synth.triggerRelease) {
            synth.triggerRelease();
        }
        
        // Dispose the old synth to free resources and prevent conflicts
        if (synth.dispose) {
            synth.dispose();
            console.log('Disposed old synth');
        }
    }
    
    // Reset state
    isPlaying = false;
    currentNotes = [];
    
    console.log(`Creating ${selectedInstrument} instrument...`);
    
    try {
        // Create the new instrument
        synth = instruments[selectedInstrument].create();
        console.log(`Changed instrument to ${selectedInstrument}`, synth);
        
        // Test the instrument with a simple note after a short delay
        // to allow samples to load if needed
        setTimeout(() => {
            if (Tone.context.state === 'running') {
                try {
                    // Use different approach based on synth type
                    if (selectedInstrument === 'bass') {
                        synth.triggerAttackRelease("C3", "8n");
                    } else {
                        synth.triggerAttackRelease(["C4", "E4", "G4"], "8n");
                    }
                    console.log(`Played test note(s) with ${selectedInstrument}`);
                } catch (e) {
                    console.error("Error playing test note:", e);
                    // Try with a fallback synth if the instrument fails
                    const fallbackSynth = new Tone.Synth().toDestination();
                    fallbackSynth.triggerAttackRelease("C4", "8n");
                    console.log("Played test note with fallback synth");
                }
            }
        }, 500);
    } catch (error) {
        console.error(`Error creating instrument ${selectedInstrument}:`, error);
        // Create a fallback synth
        synth = new Tone.Synth().toDestination();
        console.log("Created fallback synth due to error");
    }
}

// Process hand tracking results
function onHandResults(results) {
    // Draw the video frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height
    );

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Draw hand landmarks
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
        }

        // Play music based on hand position
        playMusicFromHandPosition(results.multiHandLandmarks[0]);
    } else {
        // Stop playing if no hands are detected
        if (synth && isPlaying) {
            // Handle both polyphonic and monophonic synths
            if (synth.releaseAll) {
                synth.releaseAll();
            } else if (synth.triggerRelease) {
                synth.triggerRelease();
            }
            isPlaying = false;
            currentNotes = [];
            console.log('No hand detected, stopped all notes');
        }
    }

    canvasCtx.restore();
}

// Play music based on hand position
function playMusicFromHandPosition(landmarks) {
    // Calculate finger positions
    const fingerPositions = calculateFingerPositions(landmarks);
    
    // Check if we have previous finger positions to compare
    if (lastFingerPositions) {
        // Determine which fingers have moved significantly
        const movedFingers = detectFingerMovement(fingerPositions, lastFingerPositions);
        
        // Play notes based on moved fingers
        if (movedFingers.length > 0 && Tone.now() - lastNoteTime > 0.1) {
            playNotesForFingers(movedFingers, fingerPositions);
            lastNoteTime = Tone.now();
        }
    }
    
    // Update last finger positions
    lastFingerPositions = fingerPositions;
    
    // Display debug info
    updateDebugInfo(fingerPositions);
}

// Calculate positions of each finger
function calculateFingerPositions(landmarks) {
    // Finger indices in MediaPipe hand landmarks
    const fingerTips = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky
    const fingerBases = [2, 5, 9, 13, 17]; // bases of each finger
    const wristIndex = 0; // Wrist landmark
    
    // Get wrist position as reference point
    const wrist = landmarks[wristIndex];
    
    // Calculate positions and extensions
    const positions = [];
    for (let i = 0; i < 5; i++) {
        const tip = landmarks[fingerTips[i]];
        const base = landmarks[fingerBases[i]];
        
        // Calculate distance between tip and base (extension)
        const extension = Math.sqrt(
            Math.pow(tip.x - base.x, 2) + 
            Math.pow(tip.y - base.y, 2) + 
            Math.pow(tip.z - base.z, 2)
        );
        
        // Calculate height (y-position) relative to the frame
        const height = 1 - tip.y; // Invert so higher = larger value
        
        // Calculate position relative to wrist (to help filter out whole hand movement)
        const relativeX = tip.x - wrist.x;
        const relativeY = tip.y - wrist.y;
        const relativeZ = tip.z - wrist.z;
        
        positions.push({
            x: tip.x,
            y: tip.y,
            z: tip.z,
            relativeX,
            relativeY,
            relativeZ,
            extension,
            height
        });
    }
    
    return positions;
}

// Detect which fingers have moved significantly
function detectFingerMovement(currentPositions, lastPositions) {
    const movedFingers = [];
    const movementThreshold = 0.015; // Sensitivity for finger movement
    
    for (let i = 0; i < 5; i++) {
        const current = currentPositions[i];
        const last = lastPositions[i];
        
        // Calculate finger extension change (how much the finger has bent)
        const extensionChange = Math.abs(current.extension - last.extension);
        
        // Calculate finger tip movement relative to the base (isolates finger movement from hand movement)
        const tipMovement = Math.sqrt(
            Math.pow(current.x - last.x, 2) + 
            Math.pow(current.y - last.y, 2) + 
            Math.pow(current.z - last.z, 2)
        );
        
        // Check if either extension change or tip movement exceeds threshold
        if (extensionChange > movementThreshold * 0.8 || tipMovement > movementThreshold) {
            // Calculate palm movement to filter out whole hand movements
            const isPalmMovement = isPalmMovingSignificantly(currentPositions, lastPositions);
            
            // Only add finger if it's not just the whole hand moving
            if (!isPalmMovement || extensionChange > movementThreshold * 1.5) {
                movedFingers.push(i);
                console.log(`Finger ${i} moved: extension change = ${extensionChange.toFixed(4)}, tip movement = ${tipMovement.toFixed(4)}`);
            }
        }
    }
    
    return movedFingers;
}

// Check if the whole palm is moving (to filter out whole hand movements)
function isPalmMovingSignificantly(currentPositions, lastPositions) {
    // Calculate average movement of all finger bases (palm movement)
    let totalMovement = 0;
    const palmMovementThreshold = 0.02;
    
    // Use the first knuckle of each finger as reference points for palm movement
    const fingerBases = [0, 1, 2, 3, 4]; // Using all fingers
    
    for (const i of fingerBases) {
        const current = currentPositions[i];
        const last = lastPositions[i];
        
        // Calculate base movement
        const movement = Math.sqrt(
            Math.pow(current.x - last.x, 2) + 
            Math.pow(current.y - last.y, 2) + 
            Math.pow(current.z - last.z, 2)
        );
        
        totalMovement += movement;
    }
    
    const avgPalmMovement = totalMovement / fingerBases.length;
    const isPalmMoving = avgPalmMovement > palmMovementThreshold;
    
    if (isPalmMoving) {
        console.log(`Palm moving: ${avgPalmMovement.toFixed(4)} > ${palmMovementThreshold}`);
    }
    
    return isPalmMoving;
}

// Play notes for the fingers that moved
function playNotesForFingers(movedFingers, fingerPositions) {
    // Stop currently playing notes
    if (synth && currentNotes.length > 0) {
        if (synth.releaseAll) {
            synth.releaseAll();
        } else if (synth.triggerRelease) {
            // For monophonic synths like MonoSynth
            synth.triggerRelease();
        }
        currentNotes = [];
        console.log('Released previous notes');
    }
    
    // Play new notes
    const notesToPlay = [];
    
    for (const fingerIndex of movedFingers) {
        // Map finger height to note index
        const position = fingerPositions[fingerIndex];
        const noteIndex = Math.floor(position.height * currentScale.length);
        const clampedNoteIndex = Math.max(0, Math.min(currentScale.length - 1, noteIndex));
        
        // Get the note to play
        const note = currentScale[clampedNoteIndex];
        notesToPlay.push(note);
    }
    
    // Play the notes
    if (notesToPlay.length > 0 && synth) {
        // Add a small delay to ensure previous notes are fully released
        setTimeout(() => {
            try {
                // Check if the synth is polyphonic or monophonic
                if (synth.triggerAttack && !synth.triggerAttackRelease) {
                    // Polyphonic synth
                    synth.triggerAttack(notesToPlay);
                } else if (synth.triggerAttack) {
                    // Monophonic synth (like bass)
                    synth.triggerAttack(notesToPlay[0]);
                } else {
                    console.warn("Unknown synth type, can't trigger attack");
                }
                
                currentNotes = notesToPlay;
                isPlaying = true;
                
                // Log the notes being played
                console.log('Playing notes:', notesToPlay.join(', '));
                
                // For bass instrument, automatically release after a short time
                if (instrumentSelect.value === 'bass') {
                    setTimeout(() => {
                        if (synth && synth.triggerRelease && isPlaying) {
                            synth.triggerRelease();
                            console.log('Auto-released bass note');
                        }
                    }, 800); // Release after 800ms
                }
            } catch (error) {
                console.error('Error playing notes:', error);
                // Try a simpler approach if the first one fails
                try {
                    if (notesToPlay.length === 1) {
                        synth.triggerAttackRelease(notesToPlay[0], "8n");
                    } else {
                        synth.triggerAttackRelease(notesToPlay, "8n");
                    }
                    console.log('Played notes using triggerAttackRelease');
                } catch (fallbackError) {
                    console.error('Fallback also failed:', fallbackError);
                }
            }
        }, 10);
    }
}

// Update debug information display
function updateDebugInfo(fingerPositions) {
    if (!fingerPositions) return;
    
    const fingerNames = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
    let debugText = '<strong>Finger Positions:</strong><br>';
    
    fingerPositions.forEach((pos, index) => {
        debugText += `${fingerNames[index]}: Extension: ${pos.extension.toFixed(2)}, Height: ${pos.height.toFixed(2)}<br>`;
    });
    
    if (currentNotes.length > 0) {
        debugText += `<br><strong>Playing:</strong> ${currentNotes.join(', ')}`;
    }
    
    // Add movement detection info
    if (lastFingerPositions) {
        debugText += `<br><br><strong>Movement Detection:</strong><br>`;
        debugText += `Threshold: ${0.015.toFixed(3)}<br>`;
        
        for (let i = 0; i < 5; i++) {
            const current = fingerPositions[i];
            const last = lastFingerPositions[i];
            const extensionChange = Math.abs(current.extension - last.extension);
            const movement = Math.sqrt(
                Math.pow(current.x - last.x, 2) + 
                Math.pow(current.y - last.y, 2) + 
                Math.pow(current.z - last.z, 2)
            );
            
            debugText += `${fingerNames[i]}: Movement: ${movement.toFixed(3)}, Extension Δ: ${extensionChange.toFixed(3)}<br>`;
        }
    }
    
    debugInfo.innerHTML = debugText;
}

// Helper function to draw connectors (from MediaPipe)
function drawConnectors(ctx, landmarks, connections, options) {
    const canvas = ctx.canvas;
    for (const connection of connections) {
        const from = landmarks[connection[0]];
        const to = landmarks[connection[1]];
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
            ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
            ctx.strokeStyle = options.color || 'white';
            ctx.lineWidth = options.lineWidth || 2;
            ctx.stroke();
        }
    }
}

// Helper function to draw landmarks (from MediaPipe)
function drawLandmarks(ctx, landmarks, options) {
    const canvas = ctx.canvas;
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(
            landmark.x * canvas.width,
            landmark.y * canvas.height,
            options.lineWidth * 2 || 4,
            0, 2 * Math.PI
        );
        ctx.fillStyle = options.color || 'red';
        ctx.fill();
    }
}

// MediaPipe hand connections (needed for drawing)
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
    [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
    [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [0, 17], [5, 9], [9, 13], [13, 17], // Palm
]; 