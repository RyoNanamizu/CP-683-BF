import { base64urlToArrayBuffer, generateKeyPair, fromBufferSource, generateLRSWithoutFakeKeys, type LRSSignature, toBytes, hexToBytes, generateLRSFromRawMessageWithoutFakeKeys, type MessagePack, uint8ArrayToBase64, fetchChallenge, type ErrorResponse, type LoginChallenge } from "@repo/shared";
const SHA256HASH_SIZE = 32;

export const getCredentialIds = async (username: string): Promise<string[]> => {
    const loginData = await fetchChallenge(username, "/api/auth/challenge") as LoginChallenge | ErrorResponse
    if ("error" in loginData) throw new Error(`Failed to fetch login challenge: ${loginData.error}`);
    return loginData.allowCredentials.map(cred => cred.id);
}


const getCredential = async (credentialId: string, salt?: BufferSource) => {
    const publicKeyCredential = await navigator.credentials.get({
        publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rpId: document.location.hostname,
            allowCredentials: [{
                type: "public-key",
                id: base64urlToArrayBuffer(credentialId),
            }],
            extensions: {
                "prf": {
                    "eval": {
                        "first": salt ?? crypto.getRandomValues(new Uint8Array(32))
                    }
                }
            }
        },
    }) as PublicKeyCredential | null;
    if (!publicKeyCredential) throw new Error("No credential returned");
    return publicKeyCredential;
}


const getDerivedKey = async (credentialId: string) => {
    const publicKeyCredential = await getCredential(credentialId);
    const extensionResults = publicKeyCredential.getClientExtensionResults();
    const derivedKey = extensionResults?.prf?.results?.first;
    if (!derivedKey) throw new Error("PRF extension did not return a derived key");
    return derivedKey

}

const generateKeyWithPRF = async (credentialId: string) => {
    const derivedKey = await getDerivedKey(credentialId);
    const { privateKey, publicKey } = generateKeyPair(fromBufferSource(derivedKey));
    return { privateKey, publicKey };
};


const LRSToBytes = (LRS: LRSSignature) => {
    const c0Bytes = hexToBytes(LRS.c0);
    const rBytes = LRS.r.map(hexToBytes)
    const IBytes = hexToBytes(LRS.I);
    const ringBytes = LRS.ring.map(hexToBytes);
    if (c0Bytes.length !== 32) throw new Error("Invalid c0 length");
    if (IBytes.length !== 32) throw new Error("Invalid I length");
    if (rBytes.some(arr => arr.length !== 32)) throw new Error("Invalid r length");
    if (ringBytes.some(arr => arr.length !== 32)) throw new Error("Invalid ring element length");
    const totalLength = 32 * (2 + rBytes.length + ringBytes.length) + 4;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    const ringSize = ringBytes.length;
    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, ringSize, false);
    result.set(buffer, offset);
    offset += 4;
    result.set(c0Bytes, offset);
    offset += c0Bytes.length;
    result.set(IBytes, offset);
    offset += IBytes.length;
    rBytes.forEach(arr => {
        result.set(arr, offset);
        offset += arr.length;
    });
    ringBytes.forEach(arr => {
        result.set(arr, offset);
        offset += arr.length;
    });
    return result;
}

/* const bytesToLRS = (bytes: Uint8Array<ArrayBuffer>): LRSSignature => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ringSize = view.getUint32(0, false);
    let offset = 4;
    const c0Bytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, 32);
    offset += 32;
    const IBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, 32);
    offset += 32;
    const rBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, 32 * ringSize);
    offset += 32 * ringSize;
    const ringBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, 32 * ringSize);
    return {
        c0: bytesToHex(c0Bytes),
        I: bytesToHex(IBytes),
        r: Array.from({ length: ringSize }, (_, i) => bytesToHex(rBytes.slice(i * 32, (i + 1) * 32))),
        ring: Array.from({ length: ringSize }, (_, i) => bytesToHex(ringBytes.slice(i * 32, (i + 1) * 32))),
    }
}
 */
const generateInternalLRS = async (message: string, pubKey: string, privKey: string) => {
    const internalLRS = generateLRSWithoutFakeKeys(message, pubKey, privKey);
    return LRSToBytes(internalLRS);
}


const encryptInternalLRS = async (internalLRS: Uint8Array<ArrayBuffer>, credentialId: string, OTK: string) => {
    const salt = await crypto.subtle.digest('SHA-256', new Uint8Array(hexToBytes(OTK)));
    const credential = await getCredential(credentialId, salt);
    const extensionResults = credential.getClientExtensionResults();
    const derivedKey = extensionResults?.prf?.results?.first;
    if (!derivedKey) throw new Error("PRF extension did not return a derived key");
    const gcmKey = await crypto.subtle.importKey(
        "raw",
        derivedKey,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            gcmKey,
            internalLRS
        )
    )
    return { ciphertext, iv };
}

const generateExternalLRS = async (message: string, internalLRSHash: Uint8Array<ArrayBuffer>, pubKey: string, privKey: string) => {
    if (!internalLRSHash || internalLRSHash.byteLength !== SHA256HASH_SIZE) {
        throw new Error("Invalid internal LRS hash");
    }
    const rawMessage = toBytes(message);
    const toAll = new Uint8Array(rawMessage.length + SHA256HASH_SIZE);
    toAll.set(internalLRSHash, 0);
    toAll.set(rawMessage, SHA256HASH_SIZE);
    return generateLRSFromRawMessageWithoutFakeKeys(toAll, pubKey, privKey);
}

export const getMessagePack = async (payload: string, timestamp: string, nonce: string, credentialId: string): Promise<MessagePack> => {
    const message = payload + timestamp + nonce;
    const { privateKey, publicKey } = await generateKeyWithPRF(credentialId);
    const internalLRSBytes = await generateInternalLRS(message, publicKey, privateKey);
    const { ciphertext, iv } = await encryptInternalLRS(internalLRSBytes, credentialId, publicKey);
    const internalLRSHash = await crypto.subtle.digest('SHA-256', internalLRSBytes);
    const externalLRS = await generateExternalLRS(message, new Uint8Array(internalLRSHash), publicKey, privateKey);
    const externalLRSBytes = LRSToBytes(externalLRS);
    const result: MessagePack = {
        meta: {
            version: "1.0",
            hash_algorithm: "SHA-256",
            curve: "ristretto255",
        },
        message: {
            payload,
            timestamp,
            nonce,
        },
        signature: uint8ArrayToBase64(externalLRSBytes),
        proof: {
            gcm: {
                ciphertext: uint8ArrayToBase64(ciphertext),
                iv: uint8ArrayToBase64(iv),
            },
            inner_hash: uint8ArrayToBase64(new Uint8Array(internalLRSHash)),
        }
    }
    console.log("Generated MessagePack:", result);
    return result
}