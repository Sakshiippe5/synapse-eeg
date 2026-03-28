"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BoardsList } from "@/lib/boards";
import { HighPassFilter, EXGFilter, Notch } from "@/lib/filters";
import {
  computeFFTMagnitudes,
  computeBandPowers,
  normalizeBands,
  classifyMood,
  detectAnomaly,
  type BandPowers,
  type MoodResult,
} from "@/lib/eegProcessing";

// ─── Constants ────────────────────────────────────────────────────────────────
const SYNC1 = 0xc7;
const SYNC2 = 0x7c;
const END   = 0x01;
const HDR   = 3;
const FFT_SIZE = 256;
const DISP  = 1500;

const BANDS: { key: keyof BandPowers; label: string; range: string; color: string }[] = [
  { key: "delta", label: "δ Delta", range: "0.5–4Hz",  color: "#6366f1" },
  { key: "theta", label: "θ Theta", range: "4–8Hz",    color: "#8b5cf6" },
  { key: "alpha", label: "α Alpha", range: "8–12Hz",   color: "#00ff88" },
  { key: "beta",  label: "β Beta",  range: "12–30Hz",  color: "#00d4ff" },
  { key: "gamma", label: "γ Gamma", range: "30–45Hz",  color: "#f59e0b" },
];

const COLORS = ["#00ff88","#00d4ff","#8b5cf6","#f59e0b","#ef4444","#10b981","#ff0080","#6366f1"];

const MOODS: { emoji: string; label: string; color: string }[] = [
  { emoji: "😴", label: "Deep Sleep", color: "#6366f1" },
  { emoji: "🧘", label: "Meditative",  color: "#8b5cf6" },
  { emoji: "😌", label: "Calm",         color: "#00ff88" },
  { emoji: "😊", label: "Happy",        color: "#10b981" },
  { emoji: "🎯", label: "Focused",      color: "#00d4ff" },
  { emoji: "😰", label: "Stressed",     color: "#ef4444" },
  { emoji: "⚡", label: "Creative",     color: "#f59e0b" },
  { emoji: "😐", label: "Neutral",      color: "#4a6080" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertEntry {
  id: number;
  msg: string;
  time: string;
}

interface HistoryEntry {
  mood: MoodResult;
  time: string;
}

interface SavedDevice {
  pid: number;
  baud: number;
  timeout: number;
}

type SimMood = "alpha" | "beta" | "theta" | "gamma";

// ─── Simulated EEG ───────────────────────────────────────────────────────────
const SIM_PROFILES: Record<SimMood, number[]> = {
  alpha: [0, 0, 80, 10, 0],
  beta:  [0, 5, 10, 70, 15],
  theta: [0, 80, 5, 5, 0],
  gamma: [0, 5, 10, 20, 60],
};
const SIM_FREQS = [2, 6, 10, 20, 38];

function simEEG(t: number, mood: SimMood): number {
  const amps = SIM_PROFILES[mood];
  return (
    amps.reduce((s, amp, i) => s + amp * Math.sin(2 * Math.PI * SIM_FREQS[i] * t), 0) +
    (Math.random() - 0.5) * 20
  );
}

// ─── EEG Canvas ──────────────────────────────────────────────────────────────
interface EEGCanvasProps {
  samples: number[];
  color: string;
  label: string;
  anomaly?: boolean;
  height?: number;
}

const EEGCanvas: React.FC<EEGCanvasProps> = ({
  samples,
  color,
  label,
  anomaly = false,
  height = 90,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    c.width  = c.offsetWidth  * dpr;
    c.height = c.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = c.offsetWidth;
    const H = c.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#0d1628";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (samples.length < 2) {
      ctx.fillStyle = "#2a3550";
      ctx.font = "11px 'Share Tech Mono'";
      ctx.textAlign = "center";
      ctx.fillText("NO SIGNAL", W / 2, H / 2);
      return;
    }

    const d   = samples.slice(-DISP);
    const mx  = Math.max(...d.map(Math.abs), 1);
    const mid = H / 2;

    ctx.shadowColor = anomaly ? "#ff0080" : color;
    ctx.shadowBlur  = anomaly ? 14 : 5;
    ctx.beginPath();
    ctx.strokeStyle = anomaly ? "#ff0080" : color;
    ctx.lineWidth   = 1.5;

    d.forEach((v, i) => {
      const x = (i / (d.length - 1)) * W;
      const y = mid - (v / mx) * (mid * 0.82);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle  = anomaly ? "#ff0080" : color;
    ctx.font       = "10px 'Share Tech Mono'";
    ctx.textAlign  = "left";
    ctx.fillText(label, 6, 14);
  }, [samples, color, label, anomaly]);

  return (
    <canvas
      ref={ref}
      className="w-full block"
      style={{ height, borderBottom: "1px solid #0d1628" }}
    />
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  // Connection state
  const [connected,    setConnected]    = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [simMode,      setSimMode]      = useState(false);
  const [deviceName,   setDeviceName]   = useState("");
  const [samplingRate, setSamplingRate] = useState(250);
  const [channelCount, setChannelCount] = useState(1);
  const [adcBits,      setAdcBits]      = useState(10);

  // Data
  const samplesRef = useRef<number[][]>([[]]);
  const [samples,  setSamples]  = useState<number[][]>([[]]);

  // Analysis
  const [bands,   setBands]   = useState<BandPowers>({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 });
  const [mood,    setMood]    = useState<MoodResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [alerts,  setAlerts]  = useState<AlertEntry[]>([]);
  const [anomaly, setAnomaly] = useState(false);

  // Controls
  const [paused,    setPaused]    = useState(false);
  const [recording, setRecording] = useState(false);
  const [notch,     setNotch]     = useState<0 | 1 | 2>(1);

  // Refs
  const portRef      = useRef<SerialPort | null>(null);
  const readerRef    = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const runningRef   = useRef(false);
  const simRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const simTRef      = useRef(0);
  const alertIdRef   = useRef(0);
  const moodCntRef   = useRef(0);
  const csvRef       = useRef<number[][]>([]);
  const pausedRef    = useRef(false);
  const srRef        = useRef(250);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { srRef.current = samplingRate; }, [samplingRate]);

  // ── Analysis loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const ch0 = samplesRef.current[0] ?? [];
      if (ch0.length < 32) return;

      const mags = computeFFTMagnitudes(ch0, FFT_SIZE);
      const raw  = computeBandPowers(mags, srRef.current);
      setBands(raw);

      const m = classifyMood(raw);
      setMood(m);

      moodCntRef.current++;
      if (moodCntRef.current % 4 === 0) {
        const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setHistory(prev => [{ mood: m, time: t }, ...prev].slice(0, 30));
      }

      const anom = detectAnomaly(ch0);
      setAnomaly(anom);
      if (anom) {
        alertIdRef.current++;
        const t = new Date().toLocaleTimeString();
        setAlerts(prev => [...prev.slice(-19), { id: alertIdRef.current, msg: "Signal spike on CH1", time: t }]);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── Push sample ──────────────────────────────────────────────────────────
  const pushSample = useCallback((vals: number[]) => {
    if (pausedRef.current) return;
    vals.forEach((v, i) => {
      if (!samplesRef.current[i]) samplesRef.current[i] = [];
      samplesRef.current[i] = [...(samplesRef.current[i].slice(-DISP)), v];
    });
    setSamples(samplesRef.current.map(ch => [...ch]));
    if (recording) csvRef.current.push(vals);
  }, [recording]);

  // ── Simulation ───────────────────────────────────────────────────────────
  const startSim = useCallback(() => {
    setSimMode(true);
    setConnected(true);
    setDeviceName("SIMULATED BioAmp EEG");
    setSamplingRate(250);
    setChannelCount(1);
    setAdcBits(10);
    samplesRef.current = [[]];

    const moods: SimMood[] = ["alpha", "alpha", "beta", "theta", "gamma", "alpha"];
    let idx = 0;
    let elapsed = 0;

    simRef.current = setInterval(() => {
      elapsed += 4;
      simTRef.current += 1 / 250;
      if (elapsed % 5000 < 4) idx = (idx + 1) % moods.length;
      pushSample([simEEG(simTRef.current, moods[idx])]);
    }, 4);
  }, [pushSample]);

  const stopSim = useCallback(() => {
    if (simRef.current) clearInterval(simRef.current);
    setSimMode(false);
    setConnected(false);
    setDeviceName("");
    samplesRef.current = [[]];
    setSamples([[]]);
  }, []);

  // ── Real serial connect ──────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      toast.error("Use Chrome or Edge browser.");
      return;
    }
    setConnecting(true);
    try {
      const savedRaw = localStorage.getItem("synapse_devs");
      const saved: SavedDevice[] = savedRaw ? JSON.parse(savedRaw) : [];
      const available = await navigator.serial.getPorts();

      let port: SerialPort | null = null;
      if (saved.length && available.length) {
        port = available.find(p => saved.some(s => s.pid === p.getInfo().usbProductId)) ?? null;
      }

      let baud    = 115200;
      let timeout = 2000;

      if (!port) {
        port = await navigator.serial.requestPort();
        const info  = port.getInfo();
        const board = BoardsList.find(b => b.field_pid === info.usbProductId);
        baud    = board?.baud_Rate      ?? 115200;
        timeout = board?.serial_timeout ?? 2000;
      } else {
        const info = port.getInfo();
        const s    = saved.find(s => s.pid === info.usbProductId);
        baud    = s?.baud    ?? 115200;
        timeout = s?.timeout ?? 2000;
      }

      await port.open({ baudRate: baud });
      portRef.current = port;

      // Handshake
      let dName = "EEG Device";
      let dSR   = 250;
      let dCh   = 1;
      let dBits = 10;

      if (port.writable) {
        const writer = port.writable.getWriter();
        setTimeout(() => writer.write(new TextEncoder().encode("WHORU\n")), 100);

        let buf = "";
        if (port.readable) {
          const r   = port.readable.getReader();
          const tid = setTimeout(() => r.cancel(), timeout + 500);
          try {
            while (true) {
              const { value, done } = await r.read();
              if (done) break;
              buf += new TextDecoder().decode(value);
              if (buf.includes("\n")) break;
            }
          } catch { /* timeout cancel */ }
          clearTimeout(tid);
          r.releaseLock();
        }

        const resp  = buf.trim().split("\n").pop() ?? "";
        dName = resp.match(/[A-Za-z0-9\-_ ]+$/)?.[0]?.trim() || "EEG Device";

        const board =
          BoardsList.find(b => b.chords_id.toLowerCase() === dName.toLowerCase()) ??
          BoardsList.find(b => b.field_pid === port!.getInfo().usbProductId);

        if (board) {
          dSR   = board.sampling_rate;
          dCh   = board.channel_count;
          dBits = board.adc_resolution;
          baud  = board.baud_Rate;
          timeout = board.serial_timeout;
        }

        const info = port.getInfo();
        const upd: SavedDevice[] = [
          ...saved.filter(s => s.pid !== info.usbProductId),
          { pid: info.usbProductId ?? 0, baud, timeout },
        ];
        localStorage.setItem("synapse_devs", JSON.stringify(upd));

        setTimeout(() => {
          writer.write(new TextEncoder().encode("START\n"));
          writer.releaseLock();
        }, timeout);

        toast.success(`Connected: ${dName}`, {
          description: `${dSR}Hz · ${dCh}ch · ${dBits}-bit`,
        });
      }

      setDeviceName(dName);
      setSamplingRate(dSR);
      setChannelCount(dCh);
      setAdcBits(dBits);
      setConnected(true);
      runningRef.current = true;
      samplesRef.current = Array.from({ length: dCh }, () => []);
      setSamples(samplesRef.current.map(() => []));

      // Binary read loop
      const PLEN = dCh * 2 + HDR + 1;
      const raw: number[] = [];

      const hp  = Array.from({ length: dCh }, () => { const f = new HighPassFilter(); f.setSamplingRate(dSR); return f; });
      const exg = Array.from({ length: dCh }, () => { const f = new EXGFilter();     f.setbits(dBits.toString(), dSR); return f; });
      const nf  = Array.from({ length: dCh }, () => { const f = new Notch();         f.setbits(dSR); return f; });

      if (port.readable) {
        const reader = port.readable.getReader();
        readerRef.current = reader;

        (async () => {
          try {
            while (runningRef.current) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) raw.push(...Array.from(value));

              // Parse binary packets
              while (raw.length >= PLEN) {
                const si = raw.findIndex((b, i) => b === SYNC1 && raw[i + 1] === SYNC2);
                if (si === -1) { raw.length = 0; break; }
                if (si + PLEN > raw.length) break;
                if (raw[si + PLEN - 1] !== END) { raw.splice(0, si + 1); continue; }

                const pkt  = raw.slice(si, si + PLEN);
                const vals: number[] = [];

                for (let ch = 0; ch < dCh; ch++) {
                  const hi = pkt[ch * 2 + HDR];
                  const lo = pkt[ch * 2 + HDR + 1];
                  let v    = (hi << 8) | lo;
                  v = hp[ch].process(v);
                  v = exg[ch].process(v, 4);   // 4 = EEG mode
                  v = nf[ch].process(v, notch);
                  vals.push(v);
                }

                pushSample(vals);
                raw.splice(0, si + PLEN);
              }
            }
          } catch (e) {
            if (runningRef.current) toast.error("Device disconnected.");
          } finally {
            reader.releaseLock();
          }
        })();
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "NotFoundError") {
        toast.error("Connection failed: " + (err?.message ?? "Unknown"));
      }
    }
    setConnecting(false);
  }, [pushSample, notch]);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    runningRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current?.writable) {
        const w = portRef.current.writable.getWriter();
        await w.write(new TextEncoder().encode("STOP\n"));
        w.releaseLock();
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch { /* ignore close errors */ }

    setConnected(false);
    setDeviceName("");
    samplesRef.current = [[]];
    setSamples([[]]);
    toast.info("Disconnected.");
  }, []);

  // ── CSV Export ───────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!csvRef.current.length) { toast.error("No data recorded."); return; }
    const firstRow = csvRef.current[0];
    const hdr  = ["ts", ...Array.from({ length: firstRow.length }, (_, i) => `ch${i + 1}`)].join(",");
    const body = csvRef.current.map((r, i) => `${i},${r.join(",")}`).join("\n");
    const a    = Object.assign(document.createElement("a"), {
      href:     URL.createObjectURL(new Blob([hdr + "\n" + body], { type: "text/csv" })),
      download: `synapse_eeg_${Date.now()}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${csvRef.current.length} samples!`);
  }, []);

  const norm = normalizeBands(bands);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#020408" }}>
      <style>{`
        @keyframes waveBar {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1.2); }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 flex-wrap gap-2"
        style={{ background: "#0a0f1a", borderBottom: "1px solid #1a2540" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <span
              className="font-display font-bold text-sm tracking-wider"
              style={{
                background: "linear-gradient(90deg,#00ff88,#00d4ff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              SynapseEEG
            </span>
          </Link>
          {connected && (
            <span
              className="font-mono text-[9px] px-2 py-0.5 rounded"
              style={{ border: "1px solid #00ff8840", color: "#00ff88", background: "#00ff8810" }}
            >
              {deviceName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-[#00ff88] status-pulse" : "bg-[#2a3550]"}`} />
            <span className="font-mono text-[10px]" style={{ color: connected ? "#00ff88" : "#2a3550" }}>
              {connected ? `${samplingRate}Hz · ${channelCount}ch · ${adcBits}bit` : "OFFLINE"}
            </span>
          </div>

          {/* Notch filter */}
          {connected && (
            <select
              className="font-mono text-[10px] px-2 py-1 rounded"
              style={{ background: "#0a0f1a", border: "1px solid #1a2540", color: "#4a6080" }}
              value={notch}
              onChange={e => setNotch(Number(e.target.value) as 0 | 1 | 2)}
            >
              <option value={0}>No Notch</option>
              <option value={1}>50Hz Notch</option>
              <option value={2}>60Hz Notch</option>
            </select>
          )}

          {/* Pause / Record / Export */}
          {connected && (
            <>
              <button
                onClick={() => setPaused(p => !p)}
                className="px-3 py-1.5 rounded font-mono text-[10px]"
                style={{ border: `1px solid ${paused ? "#f59e0b" : "#1a2540"}`, color: paused ? "#f59e0b" : "#4a6080" }}
              >
                {paused ? "▶ RESUME" : "⏸ PAUSE"}
              </button>
              <button
                onClick={() => { setRecording(r => !r); if (!recording) csvRef.current = []; }}
                className="px-3 py-1.5 rounded font-mono text-[10px]"
                style={{ border: `1px solid ${recording ? "#ef4444" : "#1a2540"}`, color: recording ? "#ef4444" : "#4a6080" }}
              >
                {recording ? "⏹ STOP REC" : "⏺ RECORD"}
              </button>
              {csvRef.current.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="px-3 py-1.5 rounded font-mono text-[10px]"
                  style={{ border: "1px solid #00d4ff40", color: "#00d4ff" }}
                >
                  ↓ CSV
                </button>
              )}
            </>
          )}

          {/* Connect / Disconnect */}
          {!connected ? (
            <div className="flex gap-2">
              <button
                onClick={connect}
                disabled={connecting}
                className="px-4 py-1.5 rounded font-mono text-[10px] font-bold disabled:opacity-40"
                style={{ background: "#00ff8820", border: "1px solid #00ff88", color: "#00ff88" }}
              >
                {connecting ? "CONNECTING..." : "⚡ CONNECT ARDUINO"}
              </button>
              <button
                onClick={simMode ? stopSim : startSim}
                className="px-3 py-1.5 rounded font-mono text-[10px]"
                style={{ border: "1px solid #7c3aed50", color: "#8b5cf6" }}
              >
                {simMode ? "STOP SIM" : "▶ SIM MODE"}
              </button>
            </div>
          ) : (
            <button
              onClick={simMode ? stopSim : disconnect}
              className="px-4 py-1.5 rounded font-mono text-[10px]"
              style={{ border: "1px solid #ef444440", color: "#ef4444" }}
            >
              DISCONNECT
            </button>
          )}
        </div>
      </nav>

      {/* ── MAIN GRID ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 p-3">

        {/* ── LEFT: Mood + Bands + Alerts ── */}
        <div className="lg:col-span-1 flex flex-col gap-3">

          {/* Mood Orb */}
          <div className="cyber-panel p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 self-start w-full">
              <span className={`w-2 h-2 rounded-full ${connected && !paused ? "bg-[#00ff88] status-pulse" : "bg-[#4a6080]"}`} />
              <span className="font-mono text-[10px] tracking-widest" style={{ color: "#4a6080" }}>
                {connected && !paused ? "LIVE MOOD ANALYSIS" : "AWAITING SIGNAL"}
              </span>
            </div>

            {/* SVG Confidence Ring */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg width="144" height="144" viewBox="0 0 144 144" className="absolute inset-0">
                <circle cx="72" cy="72" r="54" fill="none" stroke="#1a2540" strokeWidth="9" />
                <circle
                  cx="72" cy="72" r="54" fill="none"
                  stroke={mood?.color ?? "#4a6080"} strokeWidth="9"
                  strokeDasharray={2 * Math.PI * 54}
                  strokeDashoffset={2 * Math.PI * 54 - ((mood?.confidence ?? 0) / 100) * 2 * Math.PI * 54}
                  strokeLinecap="round" transform="rotate(-90 72 72)"
                  style={{ transition: "stroke-dashoffset .9s ease, stroke .5s ease" }}
                />
              </svg>
              <div className="flex flex-col items-center z-10">
                <span
                  className="text-5xl leading-none"
                  style={{ filter: `drop-shadow(0 0 10px ${mood?.color ?? "#4a6080"})` }}
                >
                  {mood?.emoji ?? "🧠"}
                </span>
                <span className="font-mono text-[10px] mt-1" style={{ color: "#4a6080" }}>
                  {mood ? `${mood.confidence}%` : "—"}
                </span>
              </div>
            </div>

            <div className="text-center">
              <div
                className="font-display font-bold text-base"
                style={{ color: mood?.color ?? "#4a6080", transition: "color .5s" }}
              >
                {mood?.mood ?? "No Signal"}
              </div>
              <div className="text-[10px] mt-1 leading-snug max-w-[200px]" style={{ color: "#4a6080" }}>
                {mood?.description ?? "Connect your BioAmp device and start streaming."}
              </div>
            </div>

            {connected && !paused && (
              <div className="flex items-end gap-[3px] h-5">
                {[3, 6, 4, 8, 5, 7, 3, 5].map((h, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{
                      height: `${h * 2.5}px`,
                      background: mood?.color ?? "#00ff88",
                      animation: `waveBar 1.2s ease-in-out ${i * 0.1}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Band Power Bars */}
          <div className="cyber-panel p-4 flex flex-col gap-3">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: "#4a6080" }}>EEG BAND POWER</div>
            {BANDS.map(b => {
              const pct = Math.round(norm[b.key] ?? 0);
              const dom = mood?.dominantBand === b.label.split(" ")[1];
              return (
                <div key={b.key}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold w-14" style={{ color: dom ? b.color : "#2a3550" }}>
                        {b.label}
                      </span>
                      <span className="font-mono text-[9px]" style={{ color: "#1a2540" }}>{b.range}</span>
                    </div>
                    <span className="font-mono text-xs font-bold" style={{ color: dom ? b.color : "#2a3550" }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "#0d1628" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: b.color,
                        opacity: dom ? 1 : 0.3,
                        boxShadow: dom ? `0 0 10px ${b.color}` : "none",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Alerts */}
          <div className="cyber-panel p-4">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: "#4a6080" }}>ANOMALY ALERTS</div>
            <div className="flex flex-col gap-2" style={{ maxHeight: 140, overflowY: "auto" }}>
              {alerts.length === 0 ? (
                <div className="font-mono text-[10px] py-3 text-center" style={{ color: "#1a2540" }}>No anomalies ✓</div>
              ) : (
                alerts.slice().reverse().map(a => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 p-2 rounded"
                    style={{ background: "#ff008015", border: "1px solid #ff008030" }}
                  >
                    <span>🚨</span>
                    <div>
                      <div className="font-mono text-[10px]" style={{ color: "#ff0080" }}>{a.msg}</div>
                      <div className="font-mono text-[9px]"  style={{ color: "#4a6080" }}>{a.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER: Signal + FFT ── */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="cyber-panel flex-1 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: "1px solid #0d1628" }}
            >
              <span className="font-mono text-[10px] tracking-widest" style={{ color: "#4a6080" }}>
                EEG SIGNAL — REAL TIME
              </span>
              <div className="flex items-center gap-2">
                {anomaly && (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded"
                    style={{ background: "#ff008020", border: "1px solid #ff008050", color: "#ff0080" }}>
                    ⚠ SPIKE
                  </span>
                )}
                {recording && (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded"
                    style={{ background: "#ef444420", border: "1px solid #ef444450", color: "#ef4444" }}>
                    ⏺ REC
                  </span>
                )}
                {simMode && (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded"
                    style={{ background: "#8b5cf620", border: "1px solid #8b5cf650", color: "#8b5cf6" }}>
                    SIM
                  </span>
                )}
              </div>
            </div>

            {connected ? (
              samples.map((ch, i) => (
                <EEGCanvas
                  key={i}
                  samples={ch}
                  color={COLORS[i % COLORS.length]}
                  label={`CH${i + 1}`}
                  anomaly={anomaly && i === 0}
                  height={Math.max(70, Math.floor(320 / Math.max(1, samples.length)))}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center" style={{ height: 300, color: "#2a3550" }}>
                <div className="text-6xl mb-4 opacity-20">📡</div>
                <div className="font-mono text-xs mb-2">No Arduino connected</div>
                <div className="font-mono text-[10px]" style={{ color: "#1a2540" }}>
                  Click CONNECT ARDUINO — or use SIM MODE for demo
                </div>
              </div>
            )}
          </div>

          {/* FFT Spectrum */}
          <div className="cyber-panel p-4">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: "#4a6080" }}>
              FFT FREQUENCY SPECTRUM
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 80 }}>
              {BANDS.map(b => {
                const pct = norm[b.key] ?? 0;
                const dom = mood?.dominantBand === b.label.split(" ")[1];
                return (
                  <div key={b.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t transition-all duration-500"
                      style={{
                        height: `${Math.max(4, (pct / 100) * 64)}px`,
                        background: b.color,
                        opacity: dom ? 1 : 0.3,
                        boxShadow: dom ? `0 0 12px ${b.color}` : "none",
                      }}
                    />
                    <span className="font-mono text-[8px]" style={{ color: b.color }}>
                      {b.label.split(" ")[0]}
                    </span>
                    <span className="font-mono text-[8px]" style={{ color: "#2a3550" }}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Mood Guide + History + Stats ── */}
        <div className="lg:col-span-1 flex flex-col gap-3">

          {/* Mood Reference */}
          <div className="cyber-panel p-4">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: "#4a6080" }}>MOOD REFERENCE</div>
            <div className="grid grid-cols-2 gap-1.5">
              {MOODS.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 p-1.5 rounded transition-all"
                  style={{
                    border: `1px solid ${mood?.mood === m.label ? m.color + "50" : "#1a2540"}`,
                    background: mood?.mood === m.label ? m.color + "18" : "transparent",
                  }}
                >
                  <span className="text-sm">{m.emoji}</span>
                  <span className="font-mono text-[9px]" style={{ color: mood?.mood === m.label ? m.color : "#4a6080" }}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mood Timeline */}
          <div className="cyber-panel p-4">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: "#4a6080" }}>MOOD TIMELINE</div>
            <div className="flex flex-col gap-2" style={{ maxHeight: 200, overflowY: "auto" }}>
              {history.length === 0 ? (
                <div className="font-mono text-[10px] text-center py-4" style={{ color: "#1a2540" }}>No history yet</div>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2" style={{ opacity: Math.max(0.3, 1 - i * 0.07) }}>
                    <span className="text-sm">{h.mood.emoji}</span>
                    <span className="font-mono text-[10px] flex-1" style={{ color: "#e0f0ff" }}>{h.mood.mood}</span>
                    <div className="w-12 h-1.5 rounded-full" style={{ background: "#0d1628" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${h.mood.confidence}%`, background: h.mood.color }}
                      />
                    </div>
                    <span className="font-mono text-[9px]" style={{ color: "#4a6080" }}>{h.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="cyber-panel p-4 grid grid-cols-2 gap-3">
            {[
              { label: "SAMPLES",     value: (samples[0]?.length ?? 0).toLocaleString() },
              { label: "CHANNELS",    value: channelCount.toString() },
              { label: "CONFIDENCE",  value: mood ? `${mood.confidence}%` : "—" },
              { label: "ALERTS",      value: alerts.length.toString() },
              { label: "RECORDED",    value: csvRef.current.length.toLocaleString() },
              { label: "SAMPLE RATE", value: connected ? `${samplingRate}Hz` : "—" },
            ].map((s, i) => (
              <div key={i}>
                <div className="font-mono text-[9px]" style={{ color: "#4a6080" }}>{s.label}</div>
                <div className="font-display font-bold text-lg" style={{ color: "#00ff88" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}