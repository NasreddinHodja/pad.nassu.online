// The browser's own deflate, raw, as zip and the read-only links use it.

export async function deflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function inflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
