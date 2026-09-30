import { startDevServer } from "../ui-capture/common";

// Match video capture: visual scenarios must not race WASM readiness or rely on an audio device.
export const startScreenshotServer = (port: number) => startDevServer(port, { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" });
