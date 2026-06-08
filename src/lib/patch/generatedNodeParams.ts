// Generated from src/lib/patch/moduleRegistry.ts by scripts/generate-node-params.ts.
// Do not edit by hand.

export const NODE_PARAMS = {
  cv_transpose: {
    octaves: {
      min: -4.0,
      max: 4.0,
      default: 0.0,
      smoothingMs: 10.0
    },
    semitones: {
      min: -11.0,
      max: 11.0,
      default: 0.0,
      smoothingMs: 10.0
    },
    cents: {
      min: -100.0,
      max: 100.0,
      default: 0.0,
      smoothingMs: 10.0
    }
  },
  cv_scaler: {
    scale: {
      min: -2.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    }
  },
  cv_mixer4: {
    gain1: {
      min: -2.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain2: {
      min: -2.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain3: {
      min: -2.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain4: {
      min: -2.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    }
  },
  vco: {
    pulseWidth: {
      min: 0.05,
      max: 0.95,
      default: 0.5,
      smoothingMs: 20.0
    },
    baseTuneCents: {
      min: -1200.0,
      max: 1200.0,
      default: 0.0,
      smoothingMs: 10.0
    },
    fineTuneCents: {
      min: -100.0,
      max: 100.0,
      default: 0.0,
      smoothingMs: 10.0
    },
    pwmAmount: {
      min: 0.0,
      max: 0.5,
      default: 0.0,
      smoothingMs: 20.0
    }
  },
  karplus_strong: {
    decay: {
      min: 0.7,
      max: 0.999,
      default: 0.94,
      smoothingMs: 20.0
    },
    damping: {
      min: 0.0,
      max: 1.0,
      default: 0.28,
      smoothingMs: 20.0
    },
    brightness: {
      min: 0.0,
      max: 1.0,
      default: 0.72,
      smoothingMs: 20.0
    }
  },
  lfo: {
    freqHz: {
      min: 0.01,
      max: 40.0,
      default: 3.0,
      smoothingMs: 50.0
    },
    pulseWidth: {
      min: 0.05,
      max: 0.95,
      default: 0.5,
      smoothingMs: 20.0
    }
  },
  adsr: {
    attack: {
      min: 0.0,
      max: 10000.0,
      default: 10.0,
      smoothingMs: 10.0
    },
    decay: {
      min: 0.0,
      max: 10000.0,
      default: 200.0,
      smoothingMs: 10.0
    },
    sustain: {
      min: 0.0,
      max: 1.0,
      default: 0.7,
      smoothingMs: 10.0
    },
    release: {
      min: 0.0,
      max: 10000.0,
      default: 250.0,
      smoothingMs: 10.0
    },
    curve: {
      min: -1.0,
      max: 1.0,
      default: 0.0,
      smoothingMs: 10.0
    }
  },
  vca: {
    bias: {
      min: 0.0,
      max: 2.0,
      default: 0.0,
      smoothingMs: 10.0
    },
    gain: {
      min: 0.0,
      max: 2.0,
      default: 1.0,
      smoothingMs: 10.0
    }
  },
  vcf: {
    cutoffHz: {
      min: 20.0,
      max: 20000.0,
      default: 1000.0,
      smoothingMs: 20.0
    },
    resonance: {
      min: 0.0,
      max: 1.0,
      default: 0.1,
      smoothingMs: 10.0
    },
    cutoffModAmountOct: {
      min: 0.0,
      max: 6.0,
      default: 1.0,
      smoothingMs: 10.0
    }
  },
  mixer4: {
    gain1: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain2: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain3: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    gain4: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: 10.0
    }
  },
  sample_player: {
    start: {
      min: 0.0,
      max: 1.0,
      default: 0.0,
      smoothingMs: null
    },
    end: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: null
    },
    gain: {
      min: 0.0,
      max: 1.0,
      default: 1.0,
      smoothingMs: 10.0
    },
    pitchSemis: {
      min: -48.0,
      max: 48.0,
      default: 0.0,
      smoothingMs: 10.0
    }
  },
  noise: {
    gain: {
      min: 0.0,
      max: 1.0,
      default: 0.3,
      smoothingMs: 10.0
    }
  },
  delay: {
    timeMs: {
      min: 1.0,
      max: 2000.0,
      default: 300.0,
      smoothingMs: 30.0
    },
    feedback: {
      min: 0.0,
      max: 0.95,
      default: 0.3,
      smoothingMs: 30.0
    },
    mix: {
      min: 0.0,
      max: 1.0,
      default: 0.2,
      smoothingMs: 10.0
    }
  },
  reverb: {
    decay: {
      min: 0.0,
      max: 1.0,
      default: 0.45,
      smoothingMs: 50.0
    },
    tone: {
      min: 0.0,
      max: 1.0,
      default: 0.55,
      smoothingMs: 50.0
    },
    mix: {
      min: 0.0,
      max: 1.0,
      default: 0.25,
      smoothingMs: 10.0
    }
  },
  saturation: {
    driveDb: {
      min: 0.0,
      max: 24.0,
      default: 6.0,
      smoothingMs: 20.0
    },
    mix: {
      min: 0.0,
      max: 1.0,
      default: 0.5,
      smoothingMs: 10.0
    }
  },
  overdrive: {
    driveDb: {
      min: 0.0,
      max: 50.0,
      default: 12.0,
      smoothingMs: 20.0
    },
    tone: {
      min: 0.0,
      max: 1.0,
      default: 0.5,
      smoothingMs: 20.0
    }
  },
  compressor: {
    squash: {
      min: 0.0,
      max: 1.0,
      default: 0.5,
      smoothingMs: 50.0
    },
    attackMs: {
      min: 10.0,
      max: 600.0,
      default: 20.0,
      smoothingMs: 50.0
    },
    mix: {
      min: 0.0,
      max: 1.0,
      default: 0.55,
      smoothingMs: 10.0
    }
  },
  output: {
    gainDb: {
      min: -60.0,
      max: 6.0,
      default: -6.0,
      smoothingMs: 30.0
    }
  }
} as const;
