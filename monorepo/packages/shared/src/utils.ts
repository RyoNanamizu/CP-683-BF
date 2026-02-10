import { ristretto255, ed25519, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, bytesToNumberLE, concatBytes } from '@noble/curves/utils.js';
import { CURVE_DST } from './constants';
const RistrettoPoint = ristretto255.Point;
const ED25519Point = ed25519.Point;

export const sha256 = async (data: string): Promise<string> => {
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataArray);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// === Utility Functions ===

const G = RistrettoPoint.BASE;
const mod = ED25519Point.CURVE().n


function toBytes(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

function hashToScalar(...data: Uint8Array[]): bigint {
    const msg = concatBytes(...data);
    return ristretto255_hasher.hashToScalar(msg, { DST: CURVE_DST });
}

function H_p(pub: Uint8Array) {
    const h2c = ristretto255_hasher.hashToCurve(pub, { DST: CURVE_DST });
    const aff = h2c.toAffine();
    return ristretto255.Point.fromAffine(aff);
}
// === Signature ===

export interface LRSSignature extends LRSSignatureLight {
    I: string;
    ring: string[];
}

export interface LRSSignatureLight {
    c0: string;
    r: string[];
}


/**
 * Generates a Linkable Ring Signature (LRS) for a message using a ring of public keys.
 * 
 * @param message - The message to be signed as a string
 * @param pubKeys - Array of public keys in hexadecimal format representing the ring
 * @param signerIndex - Index of the signer's public key within the ring (0-based)
 * @param privKey - The signer's private key in hexadecimal format
 * @returns {LRSSignature} An object containing:
 *   - `c0`: The initial hash value as a hex string
 *   - `r`: Array of response values as hex strings
 *   - `I`: The linkability tag as a hex string
 *   - `ring`: The original array of public keys
 * 
 * @throws {Error} If signerIndex is out of bounds or invalid cryptographic operations fail
 * 
 * @example
 * ```typescript
 * const signature = generateLRS(
 *   "hello world",
 *   ["0x...", "0x...", "0x..."],
 *   1,
 *   "0x..."
 * );
 * ```
 */
export function generateLRS(
    message: string,
    pubKeys: string[],
    signerIndex: number,
    privKey: string
): LRSSignature {

    const n = pubKeys.length;
    const ring = pubKeys.map(pk => RistrettoPoint.fromHex(pk));
    const x = bytesToNumberLE(hexToBytes(privKey));
    const P_i = ring[signerIndex];

    const Hp = H_p(P_i.toBytes());
    const I = Hp.multiply(x);

    const r: bigint[] = new Array(n);
    const c: bigint[] = new Array(n);

    const u = ed25519.utils.randomSecretKey();
    const uScalar = bytesToNumberLE(u);
    const L_i = G.multiply(uScalar);
    const R_i = Hp.multiply(uScalar);
    const i1 = (signerIndex + 1) % n;

    c[i1] = hashToScalar(toBytes(message), L_i.toBytes(), R_i.toBytes());
    for (let j = 1; j < n; j++) {
        const idx = (signerIndex + j) % n;
        r[idx] = bytesToNumberLE(ed25519.utils.randomSecretKey()) % mod;
        const L = G.multiply(r[idx]).add(ring[idx].multiply(c[idx]));
        const R = H_p(ring[idx].toBytes()).multiply(r[idx]).add(I.multiply(c[idx]));

        const nextIdx = (idx + 1) % n;
        c[nextIdx] = hashToScalar(toBytes(message), L.toBytes(), R.toBytes());
    }
    const summary = (uScalar - c[signerIndex] * x) % mod;
    r[signerIndex] = (summary + mod) % mod;

    return {
        c0: c[0].toString(16),
        r: r.map(val => val.toString(16)),
        I: I.toHex(),
        ring: pubKeys  // 如果 pk 是 Uint8Array 或 ArrayBuffer
    };
}

// === Verification ===

export function verifyLRS(
    message: string,
    sig: LRSSignature
): boolean {
    const n = sig.ring.length;
    const ring = sig.ring.map(hex => RistrettoPoint.fromHex(hex));
    const r: bigint[] = sig.r.map(h => BigInt('0x' + h));
    const c: bigint[] = new Array(n);
    c[0] = BigInt('0x' + sig.c0);
    const I = RistrettoPoint.fromHex(sig.I);

    for (let j = 0; j < n; j++) {
        const L = G.multiply(r[j]).add(ring[j].multiply(c[j]));
        const R = H_p(ring[j].toBytes()).multiply(r[j]).add(I.multiply(c[j]));

        const next = (j + 1) % n;
        c[next] = hashToScalar(toBytes(message), L.toBytes(), R.toBytes());
    }

    return c[0] === BigInt('0x' + sig.c0);
}

/**
 * Generates an Ed25519 key pair using ristretto255 elliptic curve cryptography.
 * 
 * @param seed - Optional 32 bytes seed value as Uint8Array for deterministic key generation.
 *               If not provided, a random secret key will be generated.
 * 
 * @returns An object containing the generated key pair:
 *          - privateKey: hex-encoded secret key string
 *          - publicKey: hex-encoded public key string derived from the secret key
 * 
 * @example
 * // Generate a random key pair
 * const { privateKey, publicKey } = generateKeyPair();
 * 
 * @example
 * // Generate a deterministic key pair from a seed
 * const seed = new Uint8Array(32);
 * const { privateKey, publicKey } = generateKeyPair(seed);
 */
export const generateKeyPair = (seed?: Uint8Array) => {
    const secretKey = ed25519.utils.randomSecretKey(seed);
    const x = RistrettoPoint.Fn.fromBytes(secretKey)
    const publicKey = G.multiply(x).toHex();
    return {
        privateKey: bytesToHex(secretKey), // Return hex string directly
        publicKey: publicKey // Return hex string directly
    }
};

export const validatePublicKey = (publicKey: string, privateKey: string): boolean => {
    const x = bytesToNumberLE(hexToBytes(privateKey));
    const publicKeyPoint = G.multiply(x);
    const validPublicKey = publicKeyPoint.toHex();
    // Logic to validate the public key using the private key
    return validPublicKey === publicKey;
};