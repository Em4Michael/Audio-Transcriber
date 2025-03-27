(() => {
    if (window.hasRecorder) return; // Prevent multiple instances
    window.hasRecorder = true;

    let mediaRecorder;
    let stream;
    let audioContext;
    let analyser;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "startRecording") {
            startRecording(message.streamId, sendResponse);
            return true;
        }

        if (message.action === "stopRecording") {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
                cleanup();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: true });
            }
            return true;
        }
    });

    function startRecording(streamId, sendResponse) {
        cleanup(); // Ensure clean state

        navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: "tab",
                    chromeMediaSourceId: streamId
                }
            }
        }).then((mediaStream) => {
            stream = mediaStream;
            console.log("Stream acquired in content script");

            if (stream.getAudioTracks().length === 0) {
                console.warn("No audio tracks available in the stream");
                sendResponse({ success: false, error: "No audio in tab" });
                cleanup();
                return;
            }

            mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
            audioContext = new AudioContext();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && analyser) {
                    event.data.arrayBuffer().then((buffer) => {
                        if (analyser) {
                            analyser.getByteFrequencyData(dataArray);
                            const audioLevel = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
                            console.log("Audio chunk captured, level:", audioLevel);
                            chrome.runtime.sendMessage({
                                action: "appendAudioChunk",
                                chunk: Array.from(new Uint8Array(buffer)),
                                audioLevel
                            });
                        }
                    }).catch((err) => console.error("Buffer error:", err));
                }
            };

            mediaRecorder.onstop = () => {
                console.log("MediaRecorder stopped in content script");
                cleanup();
            };

            mediaRecorder.start(500); // Record in 500ms chunks
            sendResponse({ success: true });
        }).catch((err) => {
            console.error("getUserMedia error in content script:", err);
            sendResponse({ success: false, error: err.message });
        });
    }

    function cleanup() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (audioContext) {
            audioContext.close().then(() => {
                console.log("AudioContext closed");
                audioContext = null;
                analyser = null;
            }).catch((err) => console.error("AudioContext close error:", err));
        }
        mediaRecorder = null;
    }
})();