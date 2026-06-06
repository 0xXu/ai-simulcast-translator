import { EventEmitter } from "events";
import { PassThrough } from "stream";
import type { ChildProcess } from "child_process";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  WhisperWorkerAdapter,
  type WhisperWorkerLaunchOptions,
  type WhisperWorkerSpawnProcess,
} from "./whisper-worker-adapter";

const launchOptions: WhisperWorkerLaunchOptions = {
  engine: "faster-whisper",
  modelName: "small.en",
  device: "cpu",
  computeType: "int8",
};

type FakeProcess = ChildProcess & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

function createProcess(): FakeProcess {
  const process = new EventEmitter() as FakeProcess;
  Object.assign(process, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  return process;
}

describe("WhisperWorkerAdapter", () => {
  let processes: FakeProcess[];
  let spawnProcess: Mock<WhisperWorkerSpawnProcess>;
  let adapter: WhisperWorkerAdapter;

  beforeEach(() => {
    processes = [];
    spawnProcess = vi.fn(() => {
      const process = createProcess();
      processes.push(process);
      return process;
    });
    adapter = new WhisperWorkerAdapter({
      workerCwd: "/workspace/workers/asr",
      startupTimeoutMs: 100,
      spawnProcess,
    });
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  async function startReady(processIndex = processes.length): Promise<FakeProcess> {
    const started = adapter.start(launchOptions);
    const process = processes[processIndex]!;
    process.stdout!.write('{"type":"status","status":"ready"}\n');
    await started;
    return process;
  }

  it("starts uv with explicit Worker launch options and cwd", async () => {
    await startReady();

    expect(spawnProcess).toHaveBeenCalledWith(
      "uv",
      [
        "run",
        "python",
        "-m",
        "asr_worker.main",
        "--engine",
        "faster-whisper",
        "--model",
        "small.en",
        "--device",
        "cpu",
        "--compute-type",
        "int8",
      ],
      {
        cwd: "/workspace/workers/asr",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    expect(adapter.getIsReady()).toBe(true);
  });

  it("sends monotonically increasing audio sequences during one run", async () => {
    const process = await startReady();
    const writes: string[] = [];
    process.stdin!.on("data", (data: Buffer) => writes.push(data.toString()));

    adapter.sendAudio("session-1", "YQ==");
    adapter.sendAudio("session-1", "Yg==");

    expect(writes.map((line) => JSON.parse(line).sequence)).toEqual([1, 2]);
  });

  it("resets the sequence after stop and restart", async () => {
    const firstProcess = await startReady();
    const firstWrites: string[] = [];
    firstProcess.stdin!.on("data", (data: Buffer) => firstWrites.push(data.toString()));
    adapter.sendAudio("session-1", "YQ==");
    adapter.sendAudio("session-1", "Yg==");

    adapter.stop();

    const secondProcess = await startReady();
    const secondWrites: string[] = [];
    secondProcess.stdin!.on("data", (data: Buffer) => secondWrites.push(data.toString()));
    adapter.sendAudio("session-2", "Yw==");

    expect(JSON.parse(firstWrites[1]!).sequence).toBe(2);
    expect(JSON.parse(secondWrites[0]!).sequence).toBe(1);
  });

  it("kills and clears a Worker that exceeds the startup timeout", async () => {
    vi.useFakeTimers();
    const started = adapter.start(launchOptions);
    const process = processes[0]!;

    const rejection = expect(started).rejects.toThrow("ASR Worker startup timeout");
    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(process.kill).toHaveBeenCalledOnce();
    expect(adapter.getIsReady()).toBe(false);

    const restarted = adapter.start(launchOptions);
    const replacement = processes[1]!;
    replacement.stdout!.write('{"type":"status","status":"ready"}\n');
    await restarted;
    expect(adapter.getIsReady()).toBe(true);
  });

  it("clears the startup timeout after ready", async () => {
    vi.useFakeTimers();
    const started = adapter.start(launchOptions);
    const process = processes[0]!;
    process.stdout!.write('{"type":"status","status":"ready"}\n');
    await started;

    await vi.advanceTimersByTimeAsync(101);

    expect(process.kill).not.toHaveBeenCalled();
    expect(adapter.getIsReady()).toBe(true);
  });

  it("cleans state on process error without throwing when no error listener exists", async () => {
    const started = adapter.start(launchOptions);
    const process = processes[0]!;
    const failure = new Error("spawn failed");

    expect(() => process.emit("error", failure)).not.toThrow();
    await expect(started).rejects.toThrow("spawn failed");
    expect(adapter.getIsReady()).toBe(false);

    await startReady();
    expect(adapter.getIsReady()).toBe(true);
  });

  it("forwards process errors to registered error listeners", async () => {
    const errorListener = vi.fn();
    adapter.on("error", errorListener);
    const started = adapter.start(launchOptions);
    const process = processes[0]!;
    const failure = new Error("spawn failed");

    process.emit("error", failure);
    await expect(started).rejects.toThrow("spawn failed");

    expect(errorListener).toHaveBeenCalledWith(failure);
  });

  it("handles stdin EPIPE without an unhandled error and clears the Worker", async () => {
    const process = await startReady();
    const failure = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

    expect(() => process.stdin.emit("error", failure)).not.toThrow();

    expect(process.kill).toHaveBeenCalledOnce();
    expect(adapter.getIsReady()).toBe(false);
    expect(() => adapter.sendAudio("session-1", "YQ==")).toThrow(
      "ASR Worker is not ready",
    );
  });

  it("reports stdin EPIPE to registered error listeners", async () => {
    const errorListener = vi.fn();
    adapter.on("error", errorListener);
    const process = await startReady();
    const failure = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

    process.stdin.emit("error", failure);

    expect(errorListener).toHaveBeenCalledWith(failure);
    expect(process.kill).toHaveBeenCalledOnce();
    expect(adapter.getIsReady()).toBe(false);
  });

  it("ignores a late stdin EPIPE after the Worker has exited", async () => {
    const errorListener = vi.fn();
    adapter.on("error", errorListener);
    const process = await startReady();
    const failure = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

    process.emit("exit", 1);

    expect(() => process.stdin.emit("error", failure)).not.toThrow();
    expect(errorListener).not.toHaveBeenCalled();
    expect(adapter.getIsReady()).toBe(false);
  });

  it("cleans a structured startup error and permits restart", async () => {
    vi.useFakeTimers();
    const errorListener = vi.fn();
    adapter.on("error", errorListener);
    const started = adapter.start(launchOptions);
    const process = processes[0]!;

    process.stdout.write(
      '{"type":"error","error_message":"Model failed to load"}\n',
    );

    await expect(started).rejects.toThrow("Model failed to load");
    expect(process.kill).toHaveBeenCalledOnce();
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Model failed to load" }),
    );

    await vi.advanceTimersByTimeAsync(101);
    const restarted = adapter.start(launchOptions);
    processes[1]!.stdout.write('{"type":"status","status":"ready"}\n');
    await restarted;
    expect(adapter.getIsReady()).toBe(true);
  });

  it("cleans state on exit and ignores a stale exit after restart", async () => {
    const firstProcess = await startReady();
    adapter.stop();
    await startReady();

    firstProcess.emit("exit", 0);
    expect(adapter.getIsReady()).toBe(true);

    processes[1]!.emit("exit", 1);
    expect(adapter.getIsReady()).toBe(false);
  });

  it("rejects an early exit, clears its timeout, and permits restart", async () => {
    vi.useFakeTimers();
    const started = adapter.start(launchOptions);
    const process = processes[0]!;

    process.emit("exit", 2);
    await expect(started).rejects.toThrow(
      "ASR Worker exited before ready (code 2)",
    );
    await vi.advanceTimersByTimeAsync(101);
    expect(process.kill).not.toHaveBeenCalled();

    const restarted = adapter.start(launchOptions);
    processes[1]!.stdout.write('{"type":"status","status":"ready"}\n');
    await restarted;
    expect(adapter.getIsReady()).toBe(true);
  });

  it("waits for a complete UTF-8 line across stdout chunks", async () => {
    const process = await startReady();
    const resultCallback = vi.fn();
    const errorCallback = vi.fn();
    adapter.on("result", resultCallback);
    adapter.on("error", errorCallback);
    const message = Buffer.from(
      '{"type":"result","text":"你好","sequence":1}\n',
      "utf8",
    );
    const splitIndex = message.indexOf(Buffer.from("你")) + 1;

    process.stdout.write(message.subarray(0, splitIndex));
    expect(resultCallback).not.toHaveBeenCalled();
    expect(errorCallback).not.toHaveBeenCalled();

    process.stdout.write(message.subarray(splitIndex));
    expect(resultCallback).toHaveBeenCalledOnce();
    expect(resultCallback.mock.calls[0]![0].text).toBe("你好");
    expect(errorCallback).not.toHaveBeenCalled();
  });

  it("handles multiple structured messages in one stdout chunk", async () => {
    const process = await startReady();
    const resultCallback = vi.fn();
    adapter.on("result", resultCallback);

    process.stdout.write(
      Buffer.from(
        '{"type":"result","text":"Hello","sequence":1}\n'
          + '{"type":"result","text":"world","sequence":2}\n',
      ),
    );

    expect(resultCallback).toHaveBeenCalledTimes(2);
  });

  it("emits structured Worker errors when a listener is registered", async () => {
    const process = await startReady();
    const errorCallback = vi.fn();
    adapter.on("error", errorCallback);

    process.stdout.write(
      '{"type":"error","error_message":"Invalid audio format"}\n',
    );

    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid audio format" }),
    );
  });

  it("throws when sending audio before ready", () => {
    expect(() => adapter.sendAudio("session-001", "YQ==")).toThrow(
      "ASR Worker is not ready",
    );
  });
});
