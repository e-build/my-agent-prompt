import { sha256 } from "../workspace/atomic-file.ts";

/** Stable question ID derived from the agent's requestId; shared by chapter and placement questions. */
export function questionIdFor(requestId: string): string {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId))
    throw new Error(`requestId 형식이 올바르지 않습니다: ${requestId}`);
  return `q-${sha256(`question:${requestId}`).slice(0, 20)}`;
}
