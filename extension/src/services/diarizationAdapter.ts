import type { TranscriptSegment } from "../types/transcript";

export interface DiarizationProvider {
  name: string;
  process(segments: TranscriptSegment[]): Promise<TranscriptSegment[]>;
}

export const basicSourceSeparationProvider: DiarizationProvider = {
  name: "Source-based audio separation",
  async process(segments) {
    return segments;
  }
};

// Future providers can adapt WhisperX, pyannote, or another self-hosted STT pipeline here.
// Cloud STT vendors should remain optional integrations and are intentionally not required.
