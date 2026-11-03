import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_JSON_BODY_BYTES, parseJsonBody, readBodyWithLimit } from "./route-guards";

function chunked(parts: string[]): Request {
  const encoder = new TextEncoder();
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < parts.length) controller.enqueue(encoder.encode(parts[pulled++]));
      else controller.close();
    },
  });
  // No Content-Length: the declared-size check can't help here.
  return new Request("https://x.example/api", {
    method: "POST",
    body: stream,
    // @ts-expect-error — Node's fetch requires duplex for streamed bodies
    duplex: "half",
  });
}

describe("readBodyWithLimit", () => {
  it("returns the body when within the limit", async () => {
    expect(await readBodyWithLimit(chunked(['{"a":', "1}"]), 100)).toBe('{"a":1}');
  });

  it("stops reading once the limit is passed", async () => {
    const parts = Array.from({ length: 100 }, () => "x".repeat(1024));
    expect(await readBodyWithLimit(chunked(parts), 4096)).toBeNull();
  });

  it("counts bytes, not characters", async () => {
    expect(await readBodyWithLimit(chunked(["é".repeat(3)]), 5)).toBeNull();
    expect(await readBodyWithLimit(chunked(["é".repeat(3)]), 6)).toBe("ééé");
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ body: z.string() });

  it("rejects an oversized chunked body with 413", async () => {
    const big = chunked([`{"body":"`, "x".repeat(MAX_JSON_BODY_BYTES), `"}`]);
    const result = await parseJsonBody(big, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("validates a normal body", async () => {
    const result = await parseJsonBody(chunked(['{"body":"hi"}']), schema);
    expect(result).toEqual({ ok: true, data: { body: "hi" } });
  });

  it("answers 400 for invalid JSON and schema errors", async () => {
    const bad = await parseJsonBody(chunked(["{nope"]), schema);
    expect(!bad.ok && bad.response.status).toBe(400);
    const wrong = await parseJsonBody(chunked(['{"body":1}']), schema);
    expect(!wrong.ok && wrong.response.status).toBe(400);
  });
});
