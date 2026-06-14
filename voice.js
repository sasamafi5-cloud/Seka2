// ============= Luna Voice System =============
class VoiceSystem {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.isSpeaking = false;
    this.lang = 'sr-Latn-RS';
    this.voices = [];
    this.selectedVoice = null;
    this.micPermission = false;
    this.onResultCallback = null;
    this.onEndCallback = null;
    this.silenceTimer = null;
    this.maxListenTime = 10000; // 10s max
    this.listenStartTime = 0;
  }

  async init() {
    // Load voices
    this.loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    // Init speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.lang;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.clearSilenceTimer();
        if (this.onResultCallback) this.onResultCallback(transcript);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.updateMicUI(false);
        this.hideTimer();
        if (this.onEndCallback) this.onEndCallback();
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech error:', event.error);
        this.isListening = false;
        this.updateMicUI(false);
        this.hideTimer();
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          if (this.onEndCallback) this.onEndCallback();
        }
      };
    }

    // Request mic permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micPermission = true;
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      this.micPermission = false;
    }

    return this.micPermission;
  }

  loadVoices() {
    this.voices = this.synthesis.getVoices();
    const preferred = this.voices.find(v =>
      v.lang.startsWith('sr') ||
      v.lang.startsWith('hr') ||
      (v.name.toLowerCase().includes('female') && v.lang.startsWith('en')) ||
      v.name.toLowerCase().includes('samantha')
    );
    this.selectedVoice = preferred || this.voices[0];
  }

  speak(text, options = {}) {
    if (!text) return;
    this.synthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang;
    u.rate = options.rate || 1.0;
    u.pitch = options.pitch || 1.0;
    u.volume = options.volume || 1.0;
    if (this.selectedVoice) u.voice = this.selectedVoice;

    u.onstart = () => {
      this.isSpeaking = true;
      this.updateMicUI(false);
      this.updateSpeakerUI(true);
    };

    u.onend = () => {
      this.isSpeaking = false;
      this.updateSpeakerUI(false);
      if (options.onEnd) options.onEnd();
    };

    this.synthesis.speak(u);
  }

  stopSpeaking() {
    this.synthesis.cancel();
    this.isSpeaking = false;
    this.updateSpeakerUI(false);
  }

  // Listen for max 10s, returns result via callback
  startListening(onResult, onEnd) {
    if (!this.recognition) {
      this.speak('Tvoj pretraživač ne podržava glasovne komande.');
      return false;
    }
    if (this.isListening) {
      this.stopListening();
      return false;
    }

    this.onResultCallback = onResult;
    this.onEndCallback = onEnd;
    this.listenStartTime = Date.now();

    try {
      this.recognition.start();
      this.isListening = true;
      this.updateMicUI(true);
      this.showTimer();

      // Max 10s auto-stop
      this.silenceTimer = setTimeout(() => {
        if (this.isListening) {
          this.stopListening();
        }
      }, this.maxListenTime);

      return true;
    } catch (e) {
      console.error('Listen start error:', e);
      return false;
    }
  }

  stopListening() {
    this.clearSilenceTimer();
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch (e) {}
    }
    this.isListening = false;
    this.updateMicUI(false);
    this.hideTimer();
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  showTimer() {
    const timer = document.getElementById('mic-timer');
    if (timer) {
      timer.style.display = 'block';
      let remaining = 10;
      timer.textContent = `⏱️ ${remaining}s`;
      this.countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0 && this.isListening) {
          timer.textContent = `⏱️ ${remaining}s`;
        } else {
          clearInterval(this.countdownInterval);
        }
      }, 1000);
    }
  }

  hideTimer() {
    const timer = document.getElementById('mic-timer');
    if (timer) timer.style.display = 'none';
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  updateMicUI(active) {
    const mic = document.getElementById('mic-button');
    if (mic) mic.classList.toggle('listening', active);
  }

  updateSpeakerUI(active) {
    const mic = document.getElementById('mic-button');
    if (mic) mic.classList.toggle('speaking', active);
  }
}

const voiceSystem = new VoiceSystem();
