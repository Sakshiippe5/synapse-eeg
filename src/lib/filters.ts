// SynapseEEG — Signal Filters
// Butterworth IIR filters for biopotential signals
// Reference: https://courses.ideate.cmu.edu/16-223/f2020/Arduino/FilterDemos/filter_gen.py

// ── High-Pass Filter (removes DC drift, 1Hz cutoff) ──────────────────────────
export class HighPassFilter {
  private z1 = 0; private z2 = 0; private x1 = 0;
  private sr = 0;

  setSamplingRate(sr: number) {
    if (this.sr !== sr) { this.z1 = this.z2 = this.x1 = 0; }
    this.sr = sr;
  }

  process(input: number): number {
    let out = input;
    if (this.sr === 250) {
      this.x1 = out - (-1.99644570 * this.z1) - (0.99645200 * this.z2);
      out = (0.99822443 * this.x1) + (-1.99644885 * this.z1) + (0.99822443 * this.z2);
    } else if (this.sr === 500) {
      this.x1 = out - (-1.99822285 * this.z1) - (0.99822443 * this.z2);
      out = (0.99911182 * this.x1) + (-1.99822364 * this.z1) + (0.99911182 * this.z2);
    }
    this.z2 = this.z1; this.z1 = this.x1;
    return out;
  }
}

// ── EXG (Signal Conditioning) Filter ─────────────────────────────────────────
export class EXGFilter {
  private z1 = 0; private z2 = 0; private x1 = 0;
  private bits = ""; private sr = 0;

  setbits(bits: string, sr: number) {
    if (this.bits !== bits || this.sr !== sr) { this.z1 = this.z2 = this.x1 = 0; }
    this.bits = bits; this.sr = sr;
  }

  process(input: number, type: number): number {
    if (type === 0) return input; // no filter
    let out = input;

    // EMG filter
    if (type === 1) {
      if (this.sr === 500) {
        this.x1 = out - (-1.94454914 * this.z1) - (0.94597794 * this.z2);
        out = (0.97298897 * this.x1) + (-1.94597794 * this.z1) + (0.97298897 * this.z2);
      } else {
        this.x1 = out - (-1.89149741 * this.z1) - (0.89487939 * this.z2);
        out = (0.94743970 * this.x1) + (-1.89487939 * this.z1) + (0.94743970 * this.z2);
      }
    }
    // ECG filter
    if (type === 2) {
      if (this.sr === 500) {
        this.x1 = out - (-1.99644570 * this.z1) - (0.99645200 * this.z2);
        out = (0.99822443 * this.x1) + (-1.99644885 * this.z1) + (0.99822443 * this.z2);
      } else {
        this.x1 = out - (-1.99288514 * this.z1) - (0.99290169 * this.z2);
        out = (0.99645085 * this.x1) + (-1.99290169 * this.z1) + (0.99645085 * this.z2);
      }
    }
    // EEG filter
    if (type === 4) {
      if (this.sr === 500) {
        this.x1 = out - (-1.99644570 * this.z1) - (0.99645200 * this.z2);
        out = (0.99822443 * this.x1) + (-1.99644885 * this.z1) + (0.99822443 * this.z2);
      } else {
        this.x1 = out - (-1.99288514 * this.z1) - (0.99290169 * this.z2);
        out = (0.99645085 * this.x1) + (-1.99290169 * this.z1) + (0.99645085 * this.z2);
      }
    }
    this.z2 = this.z1; this.z1 = this.x1;
    return out;
  }
}

// ── Notch Filter (50Hz or 60Hz power line noise removal) ─────────────────────
export class Notch {
  private z1 = 0; private z2 = 0; private sr = 250;

  setbits(sr: number) { this.sr = sr; this.z1 = this.z2 = 0; }

  process(input: number, type: number): number {
    if (type === 0) return input;
    let out = input;

    if (this.sr === 500) {
      if (type === 1) { // 50Hz notch at 500Hz SR
        const x = out - (-1.56167878 * this.z1) - (0.94280904 * this.z2);
        out = (0.97140452 * x) + (-1.56167878 * this.z1) + (0.97140452 * this.z2);
      } else { // 60Hz notch at 500Hz SR
        const x = out - (-1.21418547 * this.z1) - (0.94280904 * this.z2);
        out = (0.97140452 * x) + (-1.21418547 * this.z1) + (0.97140452 * this.z2);
      }
    } else {
      if (type === 1) { // 50Hz notch at 250Hz SR
        const x = out - (-1.14297345 * this.z1) - (0.88783499 * this.z2);
        out = (0.94391750 * x) + (-1.14297345 * this.z1) + (0.94391750 * this.z2);
      } else { // 60Hz notch at 250Hz SR
        const x = out - (-0.53589793 * this.z1) - (0.88783499 * this.z2);
        out = (0.94391750 * x) + (-0.53589793 * this.z1) + (0.94391750 * this.z2);
      }
    }
    this.z2 = this.z1; this.z1 = input;
    return out;
  }
}
