export interface RecordingStartGate {
  currentToken: number;
  playbackStartToken: number | null;
}

export interface RecordingPlaybackStartCompletion {
  current: boolean;
  ownsPlaybackStart: boolean;
}

export const createRecordingStartGate = (): RecordingStartGate => ({
  currentToken: 0,
  playbackStartToken: null
});

export const beginRecordingStart = (gate: RecordingStartGate): number => {
  gate.currentToken += 1;
  return gate.currentToken;
};

export const cancelRecordingStart = (gate: RecordingStartGate): void => {
  gate.currentToken += 1;
};

export const claimRecordingPlaybackStart = (gate: RecordingStartGate, token: number): boolean => {
  if (gate.playbackStartToken === token) {
    return false;
  }
  gate.playbackStartToken = token;
  return true;
};

export const completeRecordingPlaybackStart = (
  gate: RecordingStartGate,
  token: number
): RecordingPlaybackStartCompletion => {
  const ownsPlaybackStart = gate.playbackStartToken === token;
  if (ownsPlaybackStart) {
    gate.playbackStartToken = null;
  }
  return {
    current: gate.currentToken === token,
    ownsPlaybackStart
  };
};
