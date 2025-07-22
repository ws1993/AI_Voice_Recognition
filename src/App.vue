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
        <h2>格式化内容</h2>
        <pre>{{ formattedResult || "暂无内容" }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import axios from "axios";

// API配置 - 请替换为您的实际API密钥
const API_CONFIG = {
  baseURL: "https://api.chatanywhere.tech",
  apiKey: import.meta.env.PUBLIC_API_KEY, // 使用环境变量
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
    formData.append("file", blob, "recording.mp3");
    formData.append("prompt", "以下是普通话的句子");
    formData.append("model", "whisper-1");
    formData.append("language", "zh");

    const response = await axios.post(
      `${API_CONFIG.baseURL}/v1/audio/transcriptions`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${API_CONFIG.apiKey}`,
          "Content-Type": "multipart/form-data", // 确保设置正确的Content-Type
          // axios会自动设置Content-Type为multipart/form-data
        },
      }
    );

    const result = response.data;
    return result.text || "";
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
    const response = await axios.post(
      `${API_CONFIG.baseURL}/v1/chat/completions`,
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
你是一个专业的管网测绘数据提取AI助手。请严格按照以下规则和结构化要求，从用户输入的自然语言描述中提取结构化数据，并输出JSON格式结果。

# 任务说明

作为管网测绘数据专家，请从自然语言描述中提取结构化数据。输出需包含完整字段、数据值、转录质量置信度（0-100%），并遵循以下规则：

---

## 一、结构化字段要求（*为必填字段）

### 1. 元件类型*
- 值域：污水井盖、雨水井盖、阀门、消防栓、检测点、排气阀、计量表、检修孔等
- 映射规则：
  - 自动标准化术语（如"污水井"→"污水井盖"）
  - 未明确时按上下文推断

### 2. 规格参数*
- 子字段：
  - 尺寸：单位自动换算为毫米（如"50厘米"→"500mm"），对于非圆形的，使用两个值来标定，如400*300mm
  - 形状：圆形/方形/矩形（未提及时：井盖默认圆形，阀门室默认矩形）
  - 深度：井深/阀井深度（单位统一为毫米）
  - 公称直径：处理专业缩写（如"DN300"→300mm）

### 3. 材质*
- 值域：铸铁、球墨铸铁、复合材料、混凝土、钢、PE、PVC、砼
- 术语转换：
  - "铁"→"铸铁"
  - "塑料"→"复合材料"
  - "水泥"→"混凝土"

### 4. 状态*
- 值域：完好/破损/沉降/缺失/异响/渗漏/腐蚀/堵塞
- 处理规则：
  - 支持多状态标记（如"破损+沉降"）
  - 未提及状态时默认为"完好"

### 5. 权属单位
- 处理规则：
  - 自动补全规范名称（如"太仓水务集团"→"太仓市水务集团有限公司"）
  - 识别常见单位模式：[地名][水务/市政/燃气]集团[公司]

### 6. 维修标记
- 值域：急需维修/计划维修/定期更换/监控使用
- 推断逻辑：
  - "需要维修"→"计划维修"
  - "立即更换"→"急需维修"
  - "建议检修"→"监控使用"

### 7. 空间定位
- 提取内容：
  - GPS坐标（如"N31.45° E121.06°"）
  - 相对位置（如"距XX路标15米"）
  - 管线桩号（如"K3+250"）

### 8. 备注
- 保留原始描述中的关键补充信息：
  - 邻近危险源（"邻近高压电缆"）
  - 特殊标识（"编号SZ-2024"）
  - 环境特征（"位于绿化带内"）

---

## 二、置信度评估规则

对每个字段独立评估置信度：

| 等级 | 分值    | 判定标准                                       |
| ---- | ------- | ---------------------------------------------- |
| A    | 90-100% | 值在原文中明确提及（如"直径50厘米"）           |
| B    | 70-89%  | 通过专业逻辑推断（如未提形状时井盖默认"圆形"） |
| C    | <70%    | 存在歧义或信息缺失（如"大型井盖"无法换算直径） |

特殊规则：

- 安全相关属性（泄漏/结构损坏）置信度阈值≥95%，否则触发人工复核
- 矛盾描述（前文"完好"后文"裂缝"）取最新信息，置信度降级

---

## 三、处理流程

1. 术语标准化：
   - 口语词转专业术语（如"生锈铁盖"→材质="铸铁"，状态="腐蚀"）
   - 统一单位（如"50cm"→"500mm"）
   - 处理专业缩写（如"DN300"→"公称直径=300mm"）
   - 识别常见单位模式（如"太仓水务集团"→"太仓市水务集团有限公司"）
   - 多音字识别（比如管网材质里面一般是砼而不是铜）
2. 单位统一：
   - 长度单位→毫米
   - 体积单位→立方米
3. 空值处理：
   if 字段未提及: 
        value = null
        missing_reason = "未提及[字段名]"
4. 带上单位：
    - 数值字段后依据实际情况添加单位（如"500mm"）

请严格按照上述要求输出结构化JSON，字段齐全，便于后续自动化处理。
`,
          },
          {
            role: "user",
            content: `请分析以下测绘现场语音记录，按要求提取信息：
语音内容：${transcription}`,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.apiKey}`,
        },
      }
    );

    const result = response.data;
    return result.choices?.[0]?.message?.content;
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
        const formatted = await formatWithOpenAI(recognizedText);
        // formattedResult.value = formatted || "格式化内容解析失败";
        // 提取content中的JSON字符串
        let jsonStr = formatted;
        // 去除markdown代码块标记
        if (jsonStr.startsWith("```json")) {
          jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/```$/, "");
        }
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
          // transcription.value = parsed.original_text || recognizedText;
          formattedResult.value = parsed || "";
          // 如需关键词，可添加：keywords.value = parsed.keywords || [];
        } catch (e) {
          formattedResult.value = "格式化内容解析失败";
          confidenceReport.value = "";
        }
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
