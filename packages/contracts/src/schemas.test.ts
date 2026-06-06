// packages/contracts/src/schemas.test.ts

import { describe, it, expect } from "vitest";
import {
  IpcMessageSchema,
  AppStatusSchema,
  validateIpcMessage,
  safeValidateIpcMessage,
} from "./schemas";
import { PROTOCOL_VERSION } from "./ipc";

describe("IPC Schemas", () => {
  describe("IpcMessageSchema", () => {
    it("validates a correct IPC message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      expect(IpcMessageSchema.parse(message)).toEqual(message);
    });

    it("rejects invalid protocol version", () => {
      const message = {
        protocolVersion: 999,
        timestamp: Date.now(),
      };

      expect(() => IpcMessageSchema.parse(message)).toThrow();
    });

    it("rejects negative timestamp", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: -1,
      };

      expect(() => IpcMessageSchema.parse(message)).toThrow();
    });
  });

  describe("AppStatusSchema", () => {
    it("validates correct app status", () => {
      const status = {
        isRunning: true,
        version: "0.1.0",
        platform: "darwin",
        uptime: 12345,
      };

      expect(AppStatusSchema.parse(status)).toEqual(status);
    });

    it("rejects invalid platform", () => {
      const status = {
        isRunning: true,
        version: "0.1.0",
        platform: "invalid",
        uptime: 12345,
      };

      expect(() => AppStatusSchema.parse(status)).toThrow();
    });
  });

  describe("validateIpcMessage", () => {
    it("returns parsed data for valid message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      expect(validateIpcMessage(message)).toEqual(message);
    });

    it("throws for invalid message", () => {
      expect(() => validateIpcMessage({})).toThrow();
    });
  });

  describe("safeValidateIpcMessage", () => {
    it("returns success result for valid message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      const result = safeValidateIpcMessage(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(message);
      }
    });

    it("returns error result for invalid message", () => {
      const result = safeValidateIpcMessage({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
