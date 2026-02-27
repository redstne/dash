// Minimal Docker client using Unix socket (Bun native fetch)
const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const API_VERSION = "v1.44";

async function dockerFetch(path: string, method = "GET"): Promise<Response> {
  return fetch(`http://localhost/${API_VERSION}${path}`, {
    method,
    // @ts-ignore Bun-specific unix socket option
    unix: DOCKER_SOCKET,
  });
}

export async function startContainer(containerId: string): Promise<void> {
  const res = await dockerFetch(`/containers/${containerId}/start`, "POST");
  // 204 = started, 304 = already running — both OK
  if (!res.ok && res.status !== 204 && res.status !== 304) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Docker start failed (${res.status}): ${text}`);
  }
}

export async function stopContainer(containerId: string, timeoutSecs = 10): Promise<void> {
  const res = await dockerFetch(`/containers/${containerId}/stop?t=${timeoutSecs}`, "POST");
  // 204 = stopped, 304 = already stopped — both OK
  if (!res.ok && res.status !== 204 && res.status !== 304) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Docker stop failed (${res.status}): ${text}`);
  }
}

export function isDockerAvailable(): boolean {
  try {
    const { statSync } = require("fs");
    statSync(DOCKER_SOCKET);
    return true;
  } catch {
    return false;
  }
}
