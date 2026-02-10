import { CreateCredentialOptions, ErrorResponse, LoginChallenge } from "./types";

export type User = { id: string; name: string };
export const hello = (name: string) => `hello ${name}`;
export function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');

  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  return bytes.buffer;
}
export const fetchChallenge = async (handle: string, endpoint: string) => {
  console.log("fetching challenge for handle:", handle);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return res.json() as Promise<CreateCredentialOptions | LoginChallenge | ErrorResponse>;
};
export function fromBufferSource(input: BufferSource) {
  let bytes: Uint8Array;

  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  return bytes;
}

export * from "./types";
export * from "./constants";
export * from "./utils";