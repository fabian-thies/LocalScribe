declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void;

class LiveAudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const channel = input?.[0];

    if (channel?.length) {
      // Copy the render quantum before posting because the backing buffer is reused.
      this.port.postMessage(new Float32Array(channel));
    }

    return true;
  }
}

registerProcessor("live-audio-capture-processor", LiveAudioCaptureProcessor);
