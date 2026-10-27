# Voice memo → transcript

Turns a recorded call (iPhone `.m4a`, or any format `ffmpeg` reads) into a French transcript with each line
labelled by speaker. Runs on a plain CPU: a 34-minute call takes about 5 minutes on 4 cores.

```sh
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r scripts/memo/requirements.txt
python3 scripts/memo/memo.py call.m4a out/ 2      # 2 = number of speakers
```

Writes `out/transcript.txt` (turns with timestamps, "Speaker 1", "Speaker 2") and `out/words.json` (every word with
its timing and speaker). Rename the speakers once you know who is who.

How it works:

1. `ffmpeg` decodes the audio to 16 kHz mono.
2. Whisper `large-v3-turbo` (faster-whisper, int8, voice-activity filter, batched) transcribes with word timings.
3. A voice fingerprint is taken every 0.75 s (Resemblyzer), grouped into speakers (k-means) and smoothed.
4. Each word gets the speaker talking at that moment; consecutive words become turns.

Limits: very short replies ("Ouais", "Parfait") can land on the wrong speaker, and crosstalk can drop a few seconds.
Check names, registrations and airport codes against your notes. The first run downloads the Whisper model (~1.6 GB).

Recordings and transcripts contain client information: keep them out of the repository.
