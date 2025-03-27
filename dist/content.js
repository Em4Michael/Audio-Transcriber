(()=>{let e,o,r,t;function n(){o&&(o.getTracks().forEach(e=>e.stop()),o=null),r&&r.close().then(()=>{console.log("AudioContext closed"),r=null,t=null}).catch(e=>console.error("AudioContext close error:",e)),e=null}window.hasRecorder||(window.hasRecorder=!0,chrome.runtime.onMessage.addListener((a,c,s)=>"startRecording"===a.action?(function(a,c){n(),navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"tab",chromeMediaSourceId:a}}}).then(a=>{if(o=a,console.log("Stream acquired in content script"),0===o.getAudioTracks().length){console.warn("No audio tracks available in the stream"),c({success:!1,error:"No audio in tab"}),n();return}e=new MediaRecorder(o,{mimeType:"audio/webm;codecs=opus"}),(t=(r=new AudioContext).createAnalyser()).fftSize=2048;let s=new Uint8Array(t.frequencyBinCount);r.createMediaStreamSource(o).connect(t),e.ondataavailable=e=>{e.data.size>0&&t&&e.data.arrayBuffer().then(e=>{if(t){t.getByteFrequencyData(s);let o=s.reduce((e,o)=>e+o,0)/s.length/255;console.log("Audio chunk captured, level:",o),chrome.runtime.sendMessage({action:"appendAudioChunk",chunk:Array.from(new Uint8Array(e)),audioLevel:o})}}).catch(e=>console.error("Buffer error:",e))},e.onstop=()=>{console.log("MediaRecorder stopped in content script"),n()},e.start(500),c({success:!0})}).catch(e=>{console.error("getUserMedia error in content script:",e),c({success:!1,error:e.message})})}(a.streamId,s),!0):"stopRecording"===a.action?(e&&"inactive"!==e.state&&(e.stop(),n()),s({success:!0}),!0):void 0))})();