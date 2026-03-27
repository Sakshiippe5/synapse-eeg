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
const BUFFER_SIZE = 1000; // keep last 1000 samples

export function useSerialEEG(): UseSerialEEGReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [samplingRate, setSamplingRate] = useState(250);
  const [channelCount, setChannelCount] = useState(1);
  const [deviceName, setDeviceName] = useState("");
  const [latestSample, setLatestSample] = useState<EEGSample | null>(null);
  const [sampleBuffer, setSampleBuffer] = useState<EEGSample[]>([]);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const hpFiltersRef = useRef<HighPassFilter[]>([]);
  const notchFiltersRef = useRef<Notch[]>([]);
  const bufferRef = useRef<EEGSample[]>([]);
  const isRunningRef = useRef(false);

  const parsePacket = useCallback((line: string, sr: number): number[] | null => {
    const parts = line.trim().split(",");
    if (parts.length < 2) return null;
    const values: number[] = [];
    for (let i = 1; i < parts.length; i++) {
      const val = parseFloat(parts[i]);
      if (isNaN(val)) return null;
      values.push(val);
    }
    return values;
  }, []);

  const initFilters = useCallback((count: number, sr: number) => {
    hpFiltersRef.current = Array.from({ length: count }, () => {
      const f = new HighPassFilter();
      f.setSamplingRate(sr);
      return f;
    });
    notchFiltersRef.current = Array.from({ length: count }, () => new Notch());
  }, []);

  const readLoop = useCallback(async (port: SerialPort, sr: number) => {
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
          const raw = parsePacket(line, sr);
          if (!raw) continue;

          // Apply highpass + notch filters
          const filtered = raw.map((v, i) => {
            let out = hpFiltersRef.current[i]?.process(v) ?? v;
            out = notchFiltersRef.current[i]?.process(out, 1) ?? out; // 50Hz notch
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
  }, [parsePacket]);

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

          // Handshake
          if (port.writable) {
            const writer = port.writable.getWriter();
            await writer.write(new TextEncoder().encode("WHORU\n"));
            writer.releaseLock();
          }

          // Read device response
          if (port.readable) {
            const reader = port.readable.getReader();
            let resp = "";
            const timeout = setTimeout(() => reader.cancel(), 2000);
            try {
              const { value } = await reader.read();
              if (value) resp = new TextDecoder().decode(value).trim();
            } catch { /* timeout */ }
            clearTimeout(timeout);
            reader.releaseLock();

            const name = resp.split("\n").pop()?.match(/[A-Za-z0-9\-_ ]+$/)?.[0]?.trim() || "EEG Device";
            const detectedSR = resp.includes("500") ? 500 : 250;
            const detectedCh = parseInt(resp.match(/CH:(\d+)/)?.[1] ?? "1");
            const ch = isNaN(detectedCh) ? 1 : Math.max(1, Math.min(16, detectedCh));

            setDeviceName(name);
            setSamplingRate(detectedSR);
            setChannelCount(ch);
            initFilters(ch, detectedSR);

            portRef.current = port;
            isRunningRef.current = true;
            setIsConnected(true);
            connected = true;

            toast.success(`Connected: ${name}`, {
              description: `${detectedSR}Hz · ${ch} channel${ch > 1 ? "s" : ""}`,
            });

            // Start data stream
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
        } catch (err) {
          try { await port.close(); } catch {}
        }
      }

      if (!connected) {
        toast.error("Could not establish communication with device.");
      }
    } catch (err: any) {
      if (err?.name !== "NotFoundError") {
        toast.error("Connection failed: " + (err?.message ?? "Unknown error"));
      }
    }
    setIsConnecting(false);
  }, [initFilters, readLoop]);

  const disconnect = useCallback(async () => {
    isRunningRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current?.writable) {
        const writer = portRef.current.writable.getWriter();
        await writer.write(new TextEncoder().encode("STOP\n"));
        writer.releaseLock();
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch {}
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
