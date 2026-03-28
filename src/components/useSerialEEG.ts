"use client";
import { useRef, useState, useCallback } from "react";
import { HighPassFilter, Notch } from "./filters";
import { toast } from "sonner";

export interface EEGSample {
  channels: number[];
  timestamp: number;
}

interface UseSerialEEGReturn {
  isConnected: boolean;
  isConnecting: boolean;
  samplingRate: number;
  channelCount: number;
  deviceName: string;
  latestSample: EEGSample | null;
  sampleBuffer: EEGSample[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const BAUD_RATES = [115200, 230400, 57600];
const BUFFER_SIZE = 1000;

export function useSerialEEG(): UseSerialEEGReturn {
  const [isConnected,  setIsConnected]  = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [samplingRate, setSamplingRate] = useState(250);
  const [channelCount, setChannelCount] = useState(1);
  const [deviceName,   setDeviceName]   = useState("");
  const [latestSample, setLatestSample] = useState<EEGSample | null>(null);
  const [sampleBuffer, setSampleBuffer] = useState<EEGSample[]>([]);

  const portRef         = useRef<SerialPort | null>(null);
  const readerRef       = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const hpFiltersRef    = useRef<HighPassFilter[]>([]);
  const notchFiltersRef = useRef<Notch[]>([]);
  const bufferRef       = useRef<EEGSample[]>([]);
  const isRunningRef    = useRef(false);

  const initFilters = useCallback((count: number, sr: number) => {
    hpFiltersRef.current = Array.from({ length: count }, () => {
      const f = new HighPassFilter();
      f.setSamplingRate(sr);
      return f;
    });
    notchFiltersRef.current = Array.from({ length: count }, () => new Notch());
  }, []);

  const readLoop = useCallback(async (port: SerialPort, _sr: number) => {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    let textBuffer = "";

    try {
      while (isRunningRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        textBuffer += new TextDecoder().decode(value);
        const lines = textBuffer.split("\n");
        textBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const parts = line.trim().split(",");
          if (parts.length < 2) continue;
          const raw: number[] = [];
          for (let i = 1; i < parts.length; i++) {
            const val = parseFloat(parts[i]);
            if (isNaN(val)) break;
            raw.push(val);
          }
          if (raw.length === 0) continue;

          const filtered = raw.map((v, i) => {
            let out = hpFiltersRef.current[i]?.process(v) ?? v;
            out = notchFiltersRef.current[i]?.process(out, 1) ?? out;
            return out;
          });

          const sample: EEGSample = { channels: filtered, timestamp: Date.now() };
          setLatestSample(sample);
          bufferRef.current = [...bufferRef.current.slice(-BUFFER_SIZE + 1), sample];
          setSampleBuffer([...bufferRef.current]);
        }
      }
    } catch (err) {
      if (isRunningRef.current) {
        console.error("Read loop error:", err);
        toast.error("Serial read error. Device disconnected.");
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      toast.error("Web Serial API not supported. Use Chrome or Edge browser.");
      return;
    }
    setIsConnecting(true);
    try {
      const port = await navigator.serial.requestPort();
      let connected = false;

      for (const baud of BAUD_RATES) {
        try {
          await port.open({ baudRate: baud });

          if (port.writable) {
            const writer = port.writable.getWriter();
            await writer.write(new TextEncoder().encode("WHORU\n"));
            writer.releaseLock();
          }

          if (port.readable) {
            const reader = port.readable.getReader();
            let resp = "";
            const tid = setTimeout(() => reader.cancel(), 2000);
            try {
              const { value } = await reader.read();
              if (value) resp = new TextDecoder().decode(value).trim();
            } catch { /* timeout */ }
            clearTimeout(tid);
            reader.releaseLock();

            const name       = resp.split("\n").pop()?.match(/[A-Za-z0-9\-_ ]+$/)?.[0]?.trim() || "EEG Device";
            const detectedSR = resp.includes("500") ? 500 : 250;
            const parsedCh   = parseInt(resp.match(/CH:(\d+)/)?.[1] ?? "1");
            const ch         = isNaN(parsedCh) ? 1 : Math.max(1, Math.min(16, parsedCh));

            setDeviceName(name);
            setSamplingRate(detectedSR);
            setChannelCount(ch);
            initFilters(ch, detectedSR);

            portRef.current      = port;
            isRunningRef.current = true;
            setIsConnected(true);
            connected            = true;

            toast.success(`Connected: ${name}`, {
              description: `${detectedSR}Hz · ${ch} channel${ch > 1 ? "s" : ""}`,
            });

            if (port.writable) {
              const writer = port.writable.getWriter();
              setTimeout(async () => {
                await writer.write(new TextEncoder().encode("START\n"));
                writer.releaseLock();
              }, 500);
            }

            readLoop(port, detectedSR);
          }
          break;
        } catch {
          try { await port.close(); } catch { /* ignore */ }
        }
      }

      if (!connected) toast.error("Could not establish communication with device.");

    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "NotFoundError") {
        toast.error("Connection failed: " + (err?.message ?? "Unknown error"));
      }
    }
    setIsConnecting(false);
  }, [initFilters, readLoop]);

  const disconnect = useCallback(async () => {
    isRunningRef.current = false;
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (portRef.current?.writable) {
        const writer = portRef.current.writable.getWriter();
        await writer.write(new TextEncoder().encode("STOP\n"));
        writer.releaseLock();
      }
      if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    } catch { /* ignore */ }

    setIsConnected(false);
    setLatestSample(null);
    bufferRef.current = [];
    setSampleBuffer([]);
    toast.info("Device disconnected.");
  }, []);

  return {
    isConnected, isConnecting, samplingRate, channelCount,
    deviceName, latestSample, sampleBuffer,
    connect, disconnect,
  };
}