"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

const BANDS = [
  { name: "δ Delta", range: "0.5–4 Hz", color: "#6366f1", desc: "Deep sleep, unconscious" },
  { name: "θ Theta", range: "4–8 Hz",   color: "#8b5cf6", desc: "Meditation, creativity" },
  { name: "α Alpha", range: "8–12 Hz",  color: "#00ff88", desc: "Calm focus, relaxation" },
  { name: "β Beta",  range: "12–30 Hz", color: "#00d4ff", desc: "Active thinking, stress" },
  { name: "γ Gamma", range: "30–45 Hz", color: "#f59e0b", desc: "Peak cognition, insight" },
];

const FEATURES = [
  { icon: "⚡", title: "Real-Time EEG", desc: "Live Arduino signal streaming via Web Serial API with zero lag." },
  { icon: "🧠", title: "Mood Detection", desc: "AI-driven mood classification from Delta, Alpha, Beta band ratios." },
  { icon: "📊", title: "Band Power FFT", desc: "Frequency spectrum analysis across all 5 EEG wave bands." },
  { icon: "🚨", title: "Anomaly Alerts", desc: "Automatic spike and seizure-pattern detection with visual alerts." },
  { icon: "📈", title: "Signal History", desc: "Rolling mood timeline and band power history tracking." },
  { icon: "💾", title: "CSV Export", desc: "One-click download of recorded EEG sessions for research." },
];

// Animated EEG SVG line
const EEGLine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Multi-band wave
      const waves = [
        { freq: 0.5, amp: 0.12, color: "#6366f1", phase: 0 },
        { freq: 2,   amp: 0.08, color: "#8b5cf6", phase: 1 },
        { freq: 5,   amp: 0.15, color: "#00ff88", phase: 0.5 },
        { freq: 12,  amp: 0.06, color: "#00d4ff", phase: 2 },
      ];

      waves.forEach(w => {
        ctx.beginPath();
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        for (let x = 0; x < W; x++) {
          const xNorm = x / W;
          const y = H / 2 + Math.sin(xNorm * w.freq * Math.PI * 6 + tRef.current + w.phase) * H * w.amp
                          + Math.sin(xNorm * w.freq * Math.PI * 12 + tRef.current * 1.3 + w.phase) * H * w.amp * 0.4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      tRef.current += 0.018;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32 rounded-lg"
      style={{ border: "1px solid #1a2540" }}
    />
  );
};

export default function Home() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const moods = ["😌 Calm", "🎯 Focused", "⚡ Creative", "😊 Happy", "🧘 Meditative"];
  const currentMood = moods[tick % moods.length];

  return (
    <main className="min-h-screen text-[#e0f0ff]">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(2,4,8,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a2540" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: "linear-gradient(135deg, #00ff88, #00d4ff)", boxShadow: "0 0 12px #00ff8860" }}>
            🧠
          </div>
          <span className="font-display font-bold text-xl tracking-wider"
            style={{ background: "linear-gradient(90deg, #00ff88, #00d4ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SynapseEEG
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ border: "1px solid #00ff8840", color: "#00ff88", background: "#00ff8810" }}>
            v1.0
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:block text-xs font-mono" style={{ color: "#4a6080" }}>
            Neural Signal Platform
          </span>
          <Link href="/dashboard">
            <button className="px-4 py-2 rounded font-mono text-sm font-bold transition-all"
              style={{ background: "linear-gradient(135deg, #00ff8820, #00d4ff20)", border: "1px solid #00ff88", color: "#00ff88" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 16px #00ff8840")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              LAUNCH DASHBOARD →
            </button>
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-32 pb-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            {/* Status pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 font-mono text-xs"
              style={{ border: "1px solid #00ff8830", background: "#00ff8808", color: "#00ff88" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] status-pulse" />
              LIVE NEURAL MONITORING READY
            </div>

            <h1 className="font-display font-black text-5xl lg:text-6xl leading-[1.1] mb-4">
              <span style={{ background: "linear-gradient(90deg, #00ff88, #00d4ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                DECODE
              </span>
              <br />
              <span className="text-[#e0f0ff]">YOUR BRAIN</span>
              <br />
              <span style={{ background: "linear-gradient(90deg, #7c3aed, #ff0080)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                IN REAL TIME
              </span>
            </h1>

            <p className="text-[#4a6080] text-base leading-relaxed mb-8 max-w-md">
              Connect your Arduino EEG sensor. Visualize live brainwave signals.
              Detect mood, focus, and mental states with AI-powered band analysis.
            </p>

            {/* Live mood ticker */}
            <div className="flex items-center gap-3 mb-8 p-3 rounded-lg font-mono text-sm"
              style={{ border: "1px solid #1a2540", background: "#0a0f1a" }}>
              <span style={{ color: "#4a6080" }}>CURRENT MOOD</span>
              <span className="flex-1 h-px" style={{ background: "#1a2540" }} />
              <span key={tick} className="font-bold" style={{ color: "#00ff88", animation: "fadeIn 0.4s ease" }}>
                {currentMood}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard">
                <button className="px-6 py-3 rounded font-display font-bold text-sm tracking-wider transition-all"
                  style={{ background: "linear-gradient(135deg, #00ff88, #00d4ff)", color: "#020408", boxShadow: "0 0 20px #00ff8840" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 40px #00ff8880")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 20px #00ff8840")}>
                  OPEN DASHBOARD
                </button>
              </Link>
              <a href="https://github.com/upsidedownlabs/Chords-Arduino-Firmware" target="_blank" rel="noreferrer">
                <button className="px-6 py-3 rounded font-mono text-sm transition-all"
                  style={{ border: "1px solid #1a2540", color: "#4a6080", background: "transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#00d4ff"; e.currentTarget.style.color = "#00d4ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a2540"; e.currentTarget.style.color = "#4a6080"; }}>
                  ↗ ARDUINO FIRMWARE
                </button>
              </a>
            </div>
          </div>

          {/* Right: EEG preview panel */}
          <div className="cyber-panel corner-tl corner-br p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs" style={{ color: "#4a6080" }}>EEG_STREAM_PREVIEW.live</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00ff88] status-pulse" />
                <span className="font-mono text-xs" style={{ color: "#00ff88" }}>SIM</span>
              </div>
            </div>
            <EEGLine />
            <div className="grid grid-cols-5 gap-2 mt-4">
              {BANDS.map(b => (
                <div key={b.name} className="flex flex-col items-center gap-1">
                  <div className="w-1.5 rounded-full" style={{ height: `${20 + Math.random() * 40}px`, background: b.color, opacity: 0.8 }} />
                  <span className="font-mono text-[9px]" style={{ color: b.color }}>{b.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BAND LEGEND ── */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <span className="font-mono text-xs" style={{ color: "#4a6080" }}>{"// EEG_FREQUENCY_BANDS"}</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #1a2540, transparent)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {BANDS.map((b, i) => (
            <div key={i} className="cyber-panel corner-tl corner-br p-4 transition-all hover:scale-105"
              style={{ "--glow-color": b.color } as React.CSSProperties}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 16px ${b.color}40`)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div className="font-display font-bold text-lg mb-1" style={{ color: b.color }}>{b.name}</div>
              <div className="font-mono text-xs mb-2" style={{ color: "#4a6080" }}>{b.range}</div>
              <div className="text-xs text-[#e0f0ff] opacity-70">{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <span className="font-mono text-xs" style={{ color: "#4a6080" }}>{"// PLATFORM_FEATURES"}</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #1a2540, transparent)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="cyber-panel p-5 transition-all"
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#00ff8840")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a2540")}>
              <div className="text-3xl mb-3">{f.icon}</div>
              <div className="font-display font-semibold text-sm mb-2" style={{ color: "#00d4ff" }}>{f.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: "#4a6080" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW TO USE ── */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <span className="font-mono text-xs" style={{ color: "#4a6080" }}>{"// QUICK_START"}</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #1a2540, transparent)" }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: "01", title: "Flash Firmware", desc: "Upload the Arduino EEG firmware to your Upside Down Labs board." },
            { step: "02", title: "Connect Hardware", desc: "Attach EEG electrodes and plug your Arduino into USB." },
            { step: "03", title: "Open Dashboard", desc: "Click Launch Dashboard and select your serial port device." },
            { step: "04", title: "Read Your Brain", desc: "See live EEG, band powers, mood detection and alerts in real time." },
          ].map((s, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="font-display font-black text-4xl" style={{ color: "#1a2540" }}>{s.step}</div>
              <div className="font-display font-semibold text-sm" style={{ color: "#00ff88" }}>{s.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: "#4a6080" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="mt-12 py-8 px-6 text-center font-mono text-xs"
        style={{ borderTop: "1px solid #1a2540", color: "#4a6080" }}>
        <div className="mb-2">
          <span style={{ color: "#00ff88" }}>SynapseEEG</span> — Final Year Project &copy; {new Date().getFullYear()}
        </div>
        <div>Built with Next.js · Web Serial API · FFT Signal Processing</div>
      </footer>
    </main>
  );
}