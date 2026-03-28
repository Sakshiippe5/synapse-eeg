// EEG Band Power & FFT Utilities
// SynapseEEG — Written from scratch

export interface BandPowers {
  delta: number; // 0.5–4 Hz   — Deep sleep
  theta: number; // 4–8 Hz     — Meditation
  alpha: number; // 8–12 Hz    — Calm/Relaxed
  beta:  number; // 12–30 Hz   — Focus/Stress
  gamma: number; // 30–45 Hz   — Peak cognition
}

export interface MoodResult {
  mood: string;
  emoji: string;
  description: string;
  confidence: number;
  dominantBand: string;
  color: string;
  glowColor: string;
  valence: "positive" | "negative" | "neutral";
}

// Simple FFT magnitude from raw samples using Goertzel-style approach
export function computeFFTMagnitudes(samples: number[], fftSize = 256): number[] {
  const n = Math.min(samples.length, fftSize);
  const magnitudes = new Array(fftSize / 2).fill(0);

  // Apply Hanning window
  const windowed = samples.slice(-n).map((s, i) => s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));

  // Pad to fftSize
  while (windowed.length < fftSize) windowed.push(0);

  // DFT (simple, sufficient for 256-point)
  for (let k = 0; k < fftSize / 2; k++) {
    let re = 0, im = 0;
    for (let t = 0; t < fftSize; t++) {
      const angle = (2 * Math.PI * k * t) / fftSize;
      re += windowed[t] * Math.cos(angle);
      im -= windowed[t] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(re * re + im * im) / fftSize;
  }

  return magnitudes;
}

export function computeBandPowers(magnitudes: number[], samplingRate: number): BandPowers {
  const freqRes = samplingRate / (magnitudes.length * 2);

  const bandPower = (lo: number, hi: number) => {
    const start = Math.max(1, Math.floor(lo / freqRes));
    const end = Math.min(Math.floor(hi / freqRes), magnitudes.length - 1);
    let p = 0;
    for (let i = start; i <= end; i++) p += magnitudes[i] * magnitudes[i];
    return p;
  };

  return {
    delta: bandPower(0.5, 4),
    theta: bandPower(4, 8),
    alpha: bandPower(8, 12),
    beta:  bandPower(12, 30),
    gamma: bandPower(30, 45),
  };
}

export function normalizeBands(bands: BandPowers): BandPowers {
  const total = Object.values(bands).reduce((a, b) => a + b, 0) || 1;
  return {
    delta: (bands.delta / total) * 100,
    theta: (bands.theta / total) * 100,
    alpha: (bands.alpha / total) * 100,
    beta:  (bands.beta  / total) * 100,
    gamma: (bands.gamma / total) * 100,
  };
}

export function classifyMood(raw: BandPowers): MoodResult {
  const n = normalizeBands(raw);
  const { delta: d, theta: t, alpha: a, beta: b, gamma: g } = n;

  // Indices
  const engagement  = b / (a + t + 0.001);
  const relaxation  = a / (b + 0.001);
  const drowsiness  = t / (b + 0.001);
  const stress      = (b + g) / (a + t + 0.001);

  // Dominant band
  const entries = Object.entries({ Delta: d, Theta: t, Alpha: a, Beta: b, Gamma: g });
  const dominant = entries.reduce((max, cur) => cur[1] > max[1] ? cur : max)[0];

  if (d > 45) return {
    mood: "Deep Sleep", emoji: "😴",
    description: "Strong Delta dominance. You are in a deep, unconscious or drowsy state.",
    confidence: Math.min(99, Math.round(d * 1.8)), dominantBand: "Delta",
    color: "#6366f1", glowColor: "#6366f140", valence: "neutral",
  };
  if (drowsiness > 1.8 || t > 38) return {
    mood: "Meditative", emoji: "🧘",
    description: "Theta waves dominant. Deep meditation, creative flow or light sleep.",
    confidence: Math.min(99, Math.round(t * 2.2)), dominantBand: "Theta",
    color: "#8b5cf6", glowColor: "#8b5cf640", valence: "positive",
  };
  if (relaxation > 2.5 && a > 28) return {
    mood: "Calm", emoji: "😌",
    description: "Alpha is strong. You are in a peaceful, restful and calm state.",
    confidence: Math.min(99, Math.round(a * 2.5)), dominantBand: "Alpha",
    color: "#00ff88", glowColor: "#00ff8840", valence: "positive",
  };
  if (a > 20 && b > 16 && stress < 1.5) return {
    mood: "Happy", emoji: "😊",
    description: "Balanced Alpha-Beta: a hallmark of positive emotional state and wellbeing.",
    confidence: Math.min(99, Math.round((a + b) * 1.3)), dominantBand: "Alpha",
    color: "#10b981", glowColor: "#10b98140", valence: "positive",
  };
  if (g > 18) return {
    mood: "Creative", emoji: "⚡",
    description: "Gamma surge detected. Peak insight, creativity or intense sensory processing.",
    confidence: Math.min(99, Math.round(g * 2.8)), dominantBand: "Gamma",
    color: "#f59e0b", glowColor: "#f59e0b40", valence: "positive",
  };
  if (engagement > 1.5 && b > 24 && b < 45) return {
    mood: "Focused", emoji: "🎯",
    description: "Beta is elevated with high engagement. Active thinking and concentration.",
    confidence: Math.min(99, Math.round(engagement * 35)), dominantBand: "Beta",
    color: "#00d4ff", glowColor: "#00d4ff40", valence: "positive",
  };
  if (stress > 2.2 && b > 30) return {
    mood: "Stressed", emoji: "😰",
    description: "High Beta+Gamma. Your mind is racing — stress, anxiety or cognitive overload.",
    confidence: Math.min(99, Math.round(b * 2.3)), dominantBand: "Beta",
    color: "#ef4444", glowColor: "#ef444440", valence: "negative",
  };

  return {
    mood: "Neutral", emoji: "😐",
    description: "Balanced activity. No strong emotional pattern detected.",
    confidence: 40, dominantBand: dominant,
    color: "#4a6080", glowColor: "#4a608040", valence: "neutral",
  };
}

// Anomaly detection: returns true if signal has unusual spike
export function detectAnomaly(samples: number[], threshold = 150): boolean {
  if (samples.length < 10) return false;
  const recent = samples.slice(-20);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  return std > threshold;
}