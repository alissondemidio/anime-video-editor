# Architecture decisions

1. **Local-first**: no login or hosted database in MVP, reducing cost and privacy concerns.
2. **Remotion**: React composition + deterministic preview, with separate server render integration later. Review current license before broader commercial distribution.
3. **Whisper/Ollama adapters**: optional local inference, no mandatory paid API.
4. **Timeline JSON**: the model produces suggestions; user retains edit control.
5. **Media provenance**: asset tags and rights metadata are first-class.
