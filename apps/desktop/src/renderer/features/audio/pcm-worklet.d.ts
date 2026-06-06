export class PcmChunker {
  constructor(chunkSamples: number);
  push(samples: Int16Array): Int16Array[];
}
