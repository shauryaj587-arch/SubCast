import { pipeline, env } from "@xenova/transformers";

// Disable local model loading — always fetch from Hugging Face Hub
env.allowLocalModels = false;

// whisper-base (74M params) gives significantly better accuracy than whisper-tiny
// (39M params), especially on clips >30s. First download is ~150MB but is cached
// in the browser afterwards for instant loads.
const MODEL_ID = "Xenova/whisper-base";

let transcriber: any = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "init") {
    try {
      if (!transcriber) {
        transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          progress_callback: (info: any) => {
            self.postMessage({ type: "progress", info });
          },
        });
      }
      self.postMessage({ type: "init_done" });
    } catch (err: any) {
      self.postMessage({ type: "error", error: err.message });
    }
    return;
  }

  if (type === "transcribe") {
    try {
      if (!transcriber) {
        throw new Error("Transcriber not initialized");
      }
      const { audioData, language } = payload;

      const out = await transcriber(audioData, {
        chunk_length_s: 25,
        stride_length_s: 6,
        return_timestamps: "word",
        language: language === "hinglish" ? "hi" : language,
      });

      self.postMessage({ type: "transcribe_done", result: out });
    } catch (err: any) {
      self.postMessage({ type: "error", error: err.message });
    }
  }
};
