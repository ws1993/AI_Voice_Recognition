<template>
  <div class="container">
    <h1>AI语音识别工具</h1>
    <div class="main-controls">
      <button @click="toggleRecording" :class="{ 'is-recording': isRecording }">
        {{ isRecording ? "停止录音" : "开始录音" }}
      </button>
      <canvas ref="visualizer" width="200" height="50" class="visualizer"></canvas>
    </div>
    <div v-if="audioURL" class="audio-player">
      <h3>录音回放:</h3>
      <audio :src="audioURL" controls></audio>
    </div>

    <div class="results">
      <div class="result-card">
        <h2>识别结果</h2>
        <p>{{ transcription || "暂无内容" }}</p>
      </div>
      <div class="result-card">
        <h2>置信报告</h2>
        <p>{{ confidenceReport || "暂无内容" }}</p>
      </div>
      <div class="result-card">
        <h2>格式化内容</h2>
        <pre>{{ formattedResult || "暂无内容" }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

// API配置 - 请替换为您的实际API密钥
const API_CONFIG = {
  baseURL: "https://api.chatanywhere.tech",
  apiKey: process.env.VITE_API_KEY, // 使用环境变量
};

const isRecording = ref(false);
const audioURL = ref(null);
const transcription = ref("");
const confidenceReport = ref("");
const formattedResult = ref("");

const visualizer = ref(null);
let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;
let animationFrameId;

async function recognizeSpeech(blob) {
  try {
    const formData = new FormData();
    formData.append("audio", blob, "recording.wav");
    formData.append("model", "whisper-1");
    formData.append("language", "zh");

    const response = await fetch(`${API_CONFIG.baseURL}/v1/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_CONFIG.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.text || result.transcription || "";
  } catch (error) {
    console.error("语音识别API调用失败:", error);
    return `语音识别失败: ${error.message}`;
  }
}

async function formatWithOpenAI(transcription) {
  // 这里应该调用实际的OpenAI API
  // 示例代码模拟API调用
  // return {
  //   original_text: transcription,
  //   structured_data: {
  //     location_description: "K1+200",
  //     features: ["电线杆", "消防栓"],
  //     measurements: ["高度15米"],
  //     notes: "",
  //   },
  //   confidence: 0.95,
  //   keywords: ["K1+202", "电线杆", "消防栓"],
  // };
  try {
    const response = await fetch(`${API_CONFIG.baseURL}/v1/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        prompt: `请分析以下测绘现场语音记录，提取结构化信息：
语音内容：${transcription}
请以JSON格式返回结果，包含以下字段：
- original_text: 原始转录文本
- structured_data: 结构化数据，包含：
  - location_description: 位置描述
  - features: 地物特征列表
  - measurements: 测量数据
  - notes: 其他备注
- confidence: 转录质量置信度(0-1)
- keywords: 关键词列表`,
      }),
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices[0].text;
  } catch (error) {
    console.error("OpenAI API调用失败:", error);
    return `格式化失败: ${error.message}`;
  }
}

const toggleRecording = async () => {
  if (isRecording.value) {
    await stopRecording();
  } else {
    await startRecording();
  }
};

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isRecording.value = true;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunks, { type: "audio/mp3" });
        audioURL.value = URL.createObjectURL(audioBlob);

        // 调用语音识别API
        const recognizedText = await recognizeSpeech(audioBlob);
        transcription.value = recognizedText;

        // 调用OpenAI API进行格式化
        const formatted = formatWithOpenAI(recognizedText);
        formattedResult.value = JSON.stringify(formatted, null, 2);

        // 简单模拟置信度计算
        const textLength = recognizedText.length;
        const confidence = textLength > 10 ? 0.95 : 0.8;
        confidenceReport.value = confidence;
      } catch (error) {
        console.error("处理录音时出错:", error);
      }
    };

    mediaRecorder.start();
    visualizeSound(stream);
  } catch (error) {
    console.error("无法获取麦克风权限:", error);
    alert("无法获取麦克风权限，请检查设置。");
  }
};

async function stopRecording() {
  if (mediaRecorder && isRecording.value) {
    mediaRecorder.stop();
    isRecording.value = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (audioContext && audioContext.state !== "closed") {
      await audioContext.close();
    }
  }
}

const visualizeSound = (stream) => {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const canvas = visualizer.value;
  const canvasCtx = canvas.getContext("2d");
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const draw = () => {
    animationFrameId = requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = "rgb(245, 245, 245)";
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const barWidth = (WIDTH / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    let hasSound = false;
    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > 0) {
        hasSound = true;
        break;
      }
    }

    if (!hasSound) {
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      return;
    }

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] / 2;
      canvasCtx.fillStyle = `rgb(50, ${barHeight + 100}, 50)`;
      canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  };

  draw();
};
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  color: #333;
}

h1 {
  text-align: center;
  color: #2c3e50;
}

.main-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  gap: 20px;
}

button {
  padding: 12px 24px;
  font-size: 16px;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  background-color: #3498db;
  color: white;
  transition: background-color 0.3s ease;
}

button:hover {
  background-color: #2980b9;
}

button.is-recording {
  background-color: #e74c3c;
}

button.is-recording:hover {
  background-color: #c0392b;
}

.visualizer {
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #f5f5f5;
}

.audio-player {
  margin-top: 20px;
  text-align: center;
}

.audio-player h3 {
  margin-bottom: 10px;
}

audio {
  width: 100%;
  max-width: 400px;
}

.results {
  margin-top: 30px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.result-card {
  background-color: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.result-card h2 {
  margin-top: 0;
  color: #2c3e50;
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

pre {
  background-color: #f8f8f8;
  padding: 15px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: "Courier New", Courier, monospace;
}
</style>
