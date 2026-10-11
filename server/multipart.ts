export interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

const CRLF = "\r\n";

export function parseMultipart(body: Buffer, contentType: string): MultipartPart[] {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundaryValue = match?.[1] ?? match?.[2];
  if (!boundaryValue) {
    throw new Error("multipart boundary missing");
  }
  const boundary = Buffer.from(`--${boundaryValue.trim()}`);
  const parts: MultipartPart[] = [];

  let cursor = body.indexOf(boundary);
  while (cursor !== -1) {
    cursor += boundary.length;
    if (body.toString("ascii", cursor, cursor + 2) === "--") {
      break;
    }
    cursor += CRLF.length;
    const headerEnd = body.indexOf(CRLF + CRLF, cursor);
    if (headerEnd === -1) {
      break;
    }
    const next = body.indexOf(boundary, headerEnd + 4);
    if (next === -1) {
      break;
    }
    const headers = body.toString("utf8", cursor, headerEnd);
    const name = /name="([^"]*)"/i.exec(headers)?.[1];
    if (name !== undefined) {
      const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
      const partType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim();
      parts.push({
        name,
        ...(filename !== undefined ? { filename } : {}),
        ...(partType ? { contentType: partType } : {}),
        // The part ends with the CRLF that precedes the next boundary.
        data: body.subarray(headerEnd + 4, next - CRLF.length),
      });
    }
    cursor = next;
  }
  return parts;
}

export function buildMultipart(parts: readonly MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = `----paseo-korean-voice-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = part.filename !== undefined
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    const headers = [`Content-Disposition: ${disposition}`];
    if (part.contentType) {
      headers.push(`Content-Type: ${part.contentType}`);
    }
    chunks.push(Buffer.from(`--${boundary}${CRLF}${headers.join(CRLF)}${CRLF}${CRLF}`), part.data, Buffer.from(CRLF));
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
