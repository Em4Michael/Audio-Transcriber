(() => {
    console.log("Background script loaded");
    console.log("Is service worker?", self instanceof ServiceWorkerGlobalScope);

    let wsUrl = "ws://localhost:8080";
    let audioChunks = [];
    let lastAudioTime = 0;
    let silenceTimeout;
    let isRecording = false;
    let isSpeaking = false;
    let pendingTranscription = false;
    let currentTabId;
    let ws;

    function initializeWebSocket() {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log("WebSocket connected to", wsUrl);
        ws.onerror = (err) => console.error("WebSocket error:", err);
        ws.onclose = () => console.log("WebSocket disconnected");
    }

    initializeWebSocket();

    async function startRecording(tabId, sendResponse) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) {
                console.error("Cannot capture audio from system pages");
                sendResponse({ success: false, error: "Cannot capture system pages" });
                return;
            }

            currentTabId = tabId;
            isRecording = true;
            audioChunks = [];

            chrome.tabCapture.getMediaStreamId({ consumerTabId: tabId }, (streamId) => {
                if (chrome.runtime.lastError || !streamId) {
                    console.error("getMediaStreamId error:", chrome.runtime.lastError?.message || "No stream ID");
                    sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Failed to get stream ID" });
                    isRecording = false;
                    return;
                }

                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ["content.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Script injection error:", chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        isRecording = false;
                        return;
                    }

                    chrome.tabs.sendMessage(tabId, { action: "startRecording", streamId }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.success) {
                            console.error("Content script error:", chrome.runtime.lastError?.message || response?.error);
                            sendResponse({ success: false, error: chrome.runtime.lastError?.message || response?.error || "Failed to start recording" });
                            isRecording = false;
                            return;
                        }
                        console.log("Recording initiated in content script");
                        sendResponse({ success: true });
                    });
                });
            });
        } catch (err) {
            console.error("Recording setup error:", err);
            sendResponse({ success: false, error: err.message });
        }
    }

    function stopRecording(sendResponse) {
        if (!isRecording) {
            sendResponse({ success: true });
            return;
        }
        chrome.tabs.sendMessage(currentTabId, { action: "stopRecording" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Stop message error:", chrome.runtime.lastError.message);
            }
            isRecording = false;
            audioChunks = [];
            chrome.storage.local.set({ recording: false });
            console.log("Recording stopped");
            sendResponse({ success: true });
        });
    }

    async function processAndRestart() {
        console.log("Processing transcription...");
        if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" });
            console.log("Audio blob size:", blob.size);
            if (blob.size > 1000) {
                try {
                    const transcription = await transcribeAudio(blob);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "transcription", text: transcription }));
                        console.log("Transcription sent:", transcription);
                    }
                    chrome.storage.local.set({ transcription });
                } catch (err) {
                    console.error("Transcription failed:", err);
                    chrome.storage.local.set({ transcription: "Error: Transcription failed" });
                }
            } else {
                console.log("Blob too small, skipping transcription:", blob.size);
                chrome.storage.local.set({ transcription: "Skipped: Audio too short" });
            }
            audioChunks = [];
        }

        // Stop and restart recording with a delay to ensure final chunk
        if (isRecording) {
            await new Promise((resolve) => {
                chrome.tabs.sendMessage(currentTabId, { action: "stopRecording" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Stop for restart error:", chrome.runtime.lastError.message);
                        isRecording = false;
                    }
                    // Wait briefly for onstop to fire and final chunk to be collected
                    setTimeout(resolve, 100);
                });
            });

            if (isRecording) {
                chrome.tabCapture.getMediaStreamId({ consumerTabId: currentTabId }, (streamId) => {
                    if (chrome.runtime.lastError || !streamId) {
                        console.error("Restart getMediaStreamId error:", chrome.runtime.lastError?.message || "No stream ID");
                        isRecording = false;
                        return;
                    }
                    chrome.tabs.sendMessage(currentTabId, { action: "startRecording", streamId }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.success) {
                            console.error("Restart content script error:", chrome.runtime.lastError?.message || response?.error);
                            isRecording = false;
                            return;
                        }
                        console.log("Recording restarted in content script");
                    });
                });
            }
        }
    }

    async function transcribeAudio(blob) {
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");
        formData.append("model", "whisper-1");
        formData.append("language", "en");

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Transcription failed: ${errorText}`);
        }

        const result = await response.json();
        console.log("Transcription result:", result.text);
        return result.text;
    }

    function checkSilence(audioLevel) {
        if (audioLevel > 0.07 && !isSpeaking) {
            isSpeaking = true;
            lastAudioTime = Date.now();
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
            console.log("Speech detected, lastAudioTime:", lastAudioTime);
        } else if (audioLevel <= 0.07 && isSpeaking) {
            isSpeaking = false;
            console.log("Silence detected after speech");
        }

        if (audioLevel <= 0.07 && isRecording && audioChunks.length > 0 && !pendingTranscription && !silenceTimeout) {
            console.log("Starting silence timer...");
            silenceTimeout = setTimeout(async () => {
                if (Date.now() - lastAudioTime >= 2000) {
                    console.log("Prolonged silence detected, processing...");
                    pendingTranscription = true;
                    await processAndRestart();
                    pendingTranscription = false;
                }
                silenceTimeout = null;
            }, 2000);
        } else if (audioLevel > 0.07 && silenceTimeout) {
            console.log("Sound detected, clearing silence timer");
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Message received:", message);

        if (message.action === "startRecording") {
            if (isRecording) {
                sendResponse({ success: false, error: "Already recording" });
            } else {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    startRecording(tabs[0].id, sendResponse);
                });
            }
            return true;
        }

        if (message.action === "stopRecording") {
            stopRecording(sendResponse);
            return true;
        }

        if (message.action === "appendAudioChunk") {
            const chunk = new Blob([new Uint8Array(message.chunk)], { type: "audio/webm;codecs=opus" });
            audioChunks.push(chunk);
            const audioLevel = message.audioLevel;
            checkSilence(audioLevel);
            sendResponse({ success: true });
        }
    });
})();