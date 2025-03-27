(() => {
    let startBtn, stopBtn, statusEl, captionEl, toggleBtn;
    let isMinimized = false;

    document.addEventListener("DOMContentLoaded", () => {
        console.log("Popup loaded");
        startBtn = document.getElementById("startBtn");
        stopBtn = document.getElementById("stopBtn");
        statusEl = document.getElementById("status");
        captionEl = document.getElementById("caption");
        toggleBtn = document.getElementById("toggleBtn");

        updateUIFromStorage();

        startBtn.addEventListener("click", () => {
            console.log("Requesting start recording");
            statusEl.textContent = "Capturing current tab audio...";
            chrome.runtime.sendMessage({ action: "startRecording" }, (response) => {
                if (chrome.runtime.lastError) {
                    handleError(`Message error: ${chrome.runtime.lastError.message}`);
                    return;
                }
                if (response && response.success) {
                    console.log("Recording started successfully");
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    statusEl.textContent = "Capturing...";
                    chrome.storage.local.set({ recording: true });
                } else {
                    handleError(`Failed to start recording: ${response?.error || 'No response'}`);
                }
            });
        });

        stopBtn.addEventListener("click", () => {
            console.log("Requesting stop recording");
            chrome.runtime.sendMessage({ action: "stopRecording" }, (response) => {
                if (chrome.runtime.lastError) {
                    handleError(`Stop error: ${chrome.runtime.lastError.message}`);
                    return;
                }
                if (response && response.success) {
                    console.log("Recording stopped successfully");
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    statusEl.textContent = "Ready";
                    chrome.storage.local.set({ recording: false });
                } else {
                    handleError(`Failed to stop recording: ${response?.error || 'No response'}`);
                }
            });
        });

        toggleBtn.addEventListener("click", () => {
            isMinimized = !isMinimized;
            if (isMinimized) {
                document.body.classList.add("minimized");
                toggleBtn.textContent = "Restore";
            } else {
                document.body.classList.remove("minimized");
                toggleBtn.textContent = "Minimize";
            }
            chrome.storage.local.set({ minimized: isMinimized });
        });

        setInterval(updateTranscription, 1000); // Faster updates for real-time feel
    });

    function updateUIFromStorage() {
        chrome.storage.local.get(["status", "transcription", "recording", "minimized"], (data) => {
            statusEl.textContent = data.status || "Ready";
            captionEl.textContent = data.transcription || "";
            isMinimized = data.minimized || false;
            if (isMinimized) {
                document.body.classList.add("minimized");
                toggleBtn.textContent = "Restore";
            } else {
                document.body.classList.remove("minimized");
                toggleBtn.textContent = "Minimize";
            }
            if (data.recording) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                statusEl.textContent = "Capturing...";
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                statusEl.textContent = data.status || "Ready";
            }
        });
    }

    function updateTranscription() {
        chrome.storage.local.get(["transcription"], (data) => {
            if (data.transcription && data.transcription !== captionEl.textContent) {
                captionEl.textContent = data.transcription;
                console.log("Updated transcription in popup:", data.transcription);
            }
        });
    }

    function handleError(err) {
        console.error("Error:", err);
        statusEl.textContent = "Error";
        captionEl.textContent = `Error: ${err}`;
        chrome.storage.local.set({ status: "Error", recording: false });
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
})();