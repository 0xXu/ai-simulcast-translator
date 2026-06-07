import { resolve } from "node:path";

export interface ResolveAsrWorkerCwdOptions {
  readonly appPath: string;
  readonly resourcesPath: string;
  readonly isPackaged: boolean;
  readonly override?: string;
}

export function resolveAsrWorkerCwd(
  options: ResolveAsrWorkerCwdOptions,
): string {
  if (options.override) {
    return resolve(options.override);
  }

  if (options.isPackaged) {
    return resolve(options.resourcesPath, "workers/asr");
  }

  return resolve(options.appPath, "../../workers/asr");
}
