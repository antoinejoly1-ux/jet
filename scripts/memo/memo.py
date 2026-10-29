"""Voice memo -> speaker-labelled transcript.

  python3 memo.py call.m4a out_dir [speakers=2]

1. Decode with ffmpeg (any iPhone/Android format) to 16 kHz mono.
2. Transcribe with faster-whisper large-v3-turbo (int8, voice-activity filter, batched, word timings).
3. Embed the voice every 0.75 s (Resemblyzer), cluster into speakers, smooth out flickers.
4. Give each word the speaker talking at its midpoint and regroup words into turns.
Writes transcript.txt (turns with timestamps) and words.json.
"""
import json, os, subprocess, sys, time
import numpy as np

audio_path, out_dir = sys.argv[1], sys.argv[2]
n_speakers = int(sys.argv[3]) if len(sys.argv) > 3 else 2
os.makedirs(out_dir, exist_ok=True)
SR = 16000
pcm = subprocess.run(["ffmpeg", "-nostdin", "-i", audio_path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
t0 = time.time()

# --- 1. Words with timings
from faster_whisper import BatchedInferencePipeline, WhisperModel
model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=os.cpu_count())
segments, info = BatchedInferencePipeline(model=model).transcribe(
    audio, language="fr", batch_size=8, vad_filter=True, beam_size=5, word_timestamps=True,
    initial_prompt="Conversation en français québécois sur un logiciel de gestion d'avions privés.")
words = [{"start": w.start, "end": w.end, "word": w.word} for s in segments for w in (s.words or [])]
print(f"transcribed {len(audio)/SR:.0f}s in {time.time()-t0:.0f}s, {len(words)} words", flush=True)

# --- 2. Who speaks when: a voice fingerprint every 0.75 s, computed in batches
import torch
from resemblyzer import VoiceEncoder
from resemblyzer.audio import wav_to_mel_spectrogram
from sklearn.cluster import KMeans
enc = VoiceEncoder("cpu", verbose=False)
win, hop = int(1.5 * SR), int(0.75 * SR)
starts = np.arange(0, max(1, len(audio) - win), hop)
centers = (starts + win / 2) / SR
w_start = np.array([w["start"] for w in words]); w_end = np.array([w["end"] for w in words])
speech = np.array([((w_start < c + 0.4) & (w_end > c - 0.4)).any() for c in centers])  # someone is talking
mels = np.stack([wav_to_mel_spectrogram(audio[s:s + win])[:160] for s in starts[speech]])
with torch.no_grad():
    emb = np.concatenate([enc(torch.from_numpy(mels[i:i + 256]).float()).numpy() for i in range(0, len(mels), 256)])
emb /= np.linalg.norm(emb, axis=1, keepdims=True)
raw = KMeans(n_speakers, n_init=20, random_state=0).fit_predict(emb)
smooth = np.array([np.bincount(raw[max(0, i - 1):i + 2]).argmax() for i in range(len(raw))])  # drop 1-window flickers
centers = centers[speech]
print(f"speakers done at {time.time()-t0:.0f}s", flush=True)

# --- 3. Words -> speaker turns
for w in words:
    mid = (w["start"] + w["end"]) / 2
    w["speaker"] = int(smooth[np.abs(centers - mid).argmin()]) + 1 if len(centers) else 1
json.dump(words, open(os.path.join(out_dir, "words.json"), "w"), ensure_ascii=False)
def ts(s): return f"{int(s//3600):02d}:{int(s%3600//60):02d}:{int(s%60):02d}"
turns = []
for w in words:
    if turns and turns[-1]["speaker"] == w["speaker"]:
        turns[-1]["text"] += w["word"]
    else:
        turns.append({"speaker": w["speaker"], "start": w["start"], "text": w["word"]})
with open(os.path.join(out_dir, "transcript.txt"), "w") as f:
    for t in turns:
        f.write(f"[{ts(t['start'])}] Speaker {t['speaker']}: {t['text'].strip()}\n\n")
share = {k: round(sum(w['end'] - w['start'] for w in words if w['speaker'] == k)) for k in range(1, n_speakers + 1)}
print(f"done in {time.time()-t0:.0f}s: {len(turns)} turns, seconds of speech per speaker {share}", flush=True)
