export interface PcmStereoData {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export const pcmStereoToWavBlob = ({ left, right, sampleRate }: PcmStereoData): Blob => {
  const numChannels = 2;
  const numFrames = Math.min(left.length, right.length);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame += 1) {
    const leftSample = Math.max(-1, Math.min(1, left[frame] ?? 0));
    const rightSample = Math.max(-1, Math.min(1, right[frame] ?? 0));
    view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7fff, true);
    offset += bytesPerSample;
    view.setInt16(offset, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([wav], { type: "audio/wav" });
};
