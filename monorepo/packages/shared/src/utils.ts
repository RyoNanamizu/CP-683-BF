import { ristretto255, ed25519, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
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


export function generateLRS(
    message: string,
    pubKeys: string[],
    signerIndex: number,
    privKey: Uint8Array
): LRSSignature {

    const n = pubKeys.length;
    const ring = pubKeys.map(pk => RistrettoPoint.fromHex(pk));
    const x = bytesToNumberLE(privKey);
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

export const generateKeyPair = () => {
    // generate a random secret key valid for ristretto255
    const secretKey = ed25519.utils.randomSecretKey();
    // compute the public key from the secret key
    const x = bytesToNumberLE(secretKey);
    const publicKeyPoint = G.multiply(x);
    const publicKey = publicKeyPoint.toHex();
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