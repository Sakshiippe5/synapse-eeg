// SynapseEEG — EEG Processing
// FFT + Band Power + Mood Classification

export interface BandPowers {
  delta: number;
  theta: number;
  alpha: number;
  beta:  number;
  gamma: number;
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

// ── Cooley-Tukey FFT (radix-2) ─────────────────────────────────────────────
// Much faster than DFT for 256 points
function fft(re: number[], im: number[]): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // FFT butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len/2] * curRe - im[i + j + len/2] * curIm;
        const vIm = re[i + j + len/2] * curIm + im[i + j + len/2] * curRe;
        re[i + j]         = uRe + vRe;
        im[i + j]         = uIm + vIm;
        re[i + j + len/2] = uRe - vRe;
        im[i + j + len/2] = uIm - vIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

export function computeFFTMagnitudes(samples: number[], fftSize = 256): number[] {
  const n = Math.min(samples.length, fftSize);
  const re = new Array(fftSize).fill(0);
  const im = new Array(fftSize).fill(0);

  // Copy samples and apply Hanning window
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = samples[samples.length - n + i] * w;
  }

  fft(re, im);

  // Return magnitude spectrum (first half)
  const mags = new Array(fftSize / 2).fill(0);
  for (let i = 0; i < fftSize / 2; i++) {
    mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / fftSize;
  }
  return mags;
}

export function computeBandPowers(magnitudes: number[], samplingRate: number): BandPowers {
  const freqRes = samplingRate / (magnitudes.length * 2);

  const bandPower = (lo: number, hi: number): number => {
    const start = Math.max(1, Math.floor(lo / freqRes));
    const end   = Math.min(Math.floor(hi / freqRes), magnitudes.length - 1);
    let p = 0;
    for (let i = start; i <= end; i++) p += magnitudes[i] * magnitudes[i];
    return p;
  };

  return {
    delta: bandPower(0.5, 4),
    theta: bandPower(4,   8),
    alpha: bandPower(8,  12),
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

  // Derived indices
  const engagement = b / (a + t + 0.001);   // >1.5 = engaged
  const relaxation = a / (b + 0.001);        // >2.5 = relaxed
  const stress     = (b + g) / (a + t + 0.001); // >2 = stressed
  const drowsiness = (d + t) / (b + 0.001);  // >3 = drowsy

  // Find dominant band
  const bandMap: Record<string, number> = { Delta: d, Theta: t, Alpha: a, Beta: b, Gamma: g };
  const dominant = Object.entries(bandMap).reduce((mx, cur) => cur[1] > mx[1] ? cur : mx)[0];

  // Classification — ordered from strongest to weakest signal patterns
  if (d > 50)
    return { mood: "Deep Sleep", emoji: "😴",
      description: "Very strong Delta. Deep or drowsy state — electrodes may need adjustment.",
      confidence: Math.min(99, Math.round(d * 1.5)), dominantBand: "Delta",
      color: "#6366f1", glowColor: "#6366f140", valence: "neutral" };

  if (drowsiness > 3 || t > 35)
    return { mood: "Meditative", emoji: "🧘",
      description: "Theta dominant — deep relaxation, meditation or light drowsiness.",
      confidence: Math.min(99, Math.round(t * 2.2)), dominantBand: "Theta",
      color: "#8b5cf6", glowColor: "#8b5cf640", valence: "positive" };

  if (stress > 2.5 && b > 25)
    return { mood: "Stressed", emoji: "😰",
      description: "Elevated Beta+Gamma — active stress, anxiety or intense thinking.",
      confidence: Math.min(99, Math.round(b * 2)), dominantBand: "Beta",
      color: "#ef4444", glowColor: "#ef444440", valence: "negative" };

  if (g > 15)
    return { mood: "Creative", emoji: "⚡",
      description: "Gamma burst — peak insight, creative flow or high sensory processing.",
      confidence: Math.min(99, Math.round(g * 3)), dominantBand: "Gamma",
      color: "#f59e0b", glowColor: "#f59e0b40", valence: "positive" };

  if (engagement > 1.5 && b > 20 && b < 40)
    return { mood: "Focused", emoji: "🎯",
      description: "Beta active with good engagement — concentrated and mentally sharp.",
      confidence: Math.min(99, Math.round(engagement * 30)), dominantBand: "Beta",
      color: "#00d4ff", glowColor: "#00d4ff40", valence: "positive" };

  if (relaxation > 2 && a > 20)
    return { mood: "Calm", emoji: "😌",
      description: "Alpha dominant — peaceful, rested and in a calm focused state.",
      confidence: Math.min(99, Math.round(a * 2.5)), dominantBand: "Alpha",
      color: "#00ff88", glowColor: "#00ff8840", valence: "positive" };

  if (a > 18 && b > 15 && stress < 1.5)
    return { mood: "Happy", emoji: "😊",
      description: "Balanced Alpha-Beta — positive emotional state and general wellbeing.",
      confidence: Math.min(99, Math.round((a + b) * 1.2)), dominantBand: "Alpha",
      color: "#10b981", glowColor: "#10b98140", valence: "positive" };

  return { mood: "Neutral", emoji: "😐",
    description: "Balanced brain activity — no strong emotional pattern detected.",
    confidence: 40, dominantBand: dominant,
    color: "#4a6080", glowColor: "#4a608040", valence: "neutral" };
}

// Spike detection
export function detectAnomaly(samples: number[], threshold = 200): boolean {
  if (samples.length < 20) return false;
  const recent = samples.slice(-20);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std  = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  return std > threshold;
}