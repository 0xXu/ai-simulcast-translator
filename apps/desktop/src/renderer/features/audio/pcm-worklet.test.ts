import { describe, expect, it } from "vitest";
import { PcmChunker } from "./pcm-worklet.js";

describe("PcmChunker", () => {
  it("waits for 400 milliseconds of 16 kHz samples", () => {
    const chunker = new PcmChunker(6400);

    expect(chunker.push(new Int16Array(6399))).toEqual([]);

    const chunks = chunker.push(new Int16Array([123]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(6400);
    expect(chunks[0]?.[6399]).toBe(123);
  });

  it("emits multiple complete chunks and keeps the remainder", () => {
    const chunker = new PcmChunker(4);

    const chunks = chunker.push(
      new Int16Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );

    expect(chunks.map((chunk) => [...chunk])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(chunker.push(new Int16Array([10, 11, 12]))[0]).toEqual(
      new Int16Array([9, 10, 11, 12]),
    );
  });
});
