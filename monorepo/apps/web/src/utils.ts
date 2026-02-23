import { base64urlToArrayBuffer, generateKeyPair, fromBufferSource, generateLRSWithoutFakeKeys, toBytes, hexToBytes, generateLRSFromRawMessageWithoutFakeKeys, type MessagePack, uint8ArrayToBase64, fetchChallenge, type ErrorResponse, type LoginChallenge, verifyLRSFromRawMessage, bytesToLRS, LRSToBytes, bytesToRawLRS } from "@repo/shared";
const SHA256HASH_SIZE = 32;

export const getCredentialIds = async (username: string): Promise<string[]> => {
    console.log("Fetching credential IDs for username:", username);
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

export const ValidateMessagePack = async (messagePack: MessagePack): Promise<boolean> => {
    // Step 1, confirming metadata
    if (messagePack.meta.version !== "1.0" ||
        messagePack.meta.hash_algorithm !== "SHA-256" ||
        messagePack.meta.curve !== "ristretto255") {
        console.error("Metadata validation failed");
        return false;
    }
    // Step 2, combian message
    const message = messagePack.message.payload + messagePack.message.timestamp + messagePack.message.nonce;
    const rawMessage = toBytes(message);
    const internalLRSHash = new Uint8Array(base64urlToArrayBuffer(messagePack.proof.inner_hash));
    if (!internalLRSHash || internalLRSHash.byteLength !== SHA256HASH_SIZE) {
        console.error("Invalid internal LRS hash");
        return false;
    }
    const toAll = new Uint8Array(rawMessage.length + SHA256HASH_SIZE);
    toAll.set(internalLRSHash, 0);
    toAll.set(rawMessage, SHA256HASH_SIZE);
    // Step 3, deserialize external LRS
    const externalLRSBytes = new Uint8Array(base64urlToArrayBuffer(messagePack.signature));
    const externalLRS = bytesToLRS(externalLRSBytes);
    return verifyLRSFromRawMessage(toAll, externalLRS);
}

export const getProofForReceiver = async (messagePack: MessagePack, credentialId: string) => {
    const externalLRSBytes = new Uint8Array(base64urlToArrayBuffer(messagePack.signature));
    const externalLRS = bytesToRawLRS(externalLRSBytes);
    const credentials: PublicKeyCredential[] = []
    for (const key of externalLRS.ring) {
        const salt = await crypto.subtle.digest('SHA-256', key);
        const credential = await getCredential(credentialId, salt);
        credentials.push(credential);
    }
    const gcmKeys = await Promise.all(credentials.map(async (credential) => {
        const extensionResults = credential.getClientExtensionResults();
        const derivedKey = extensionResults?.prf?.results?.first;
        if (!derivedKey) throw new Error("PRF extension did not return a derived key");
        const gcmKey = await crypto.subtle.importKey(
            "raw",
            derivedKey,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );
        return gcmKey
    }));
    console.log("Derived GCM keys for proof validation:", gcmKeys);
    const results = await Promise.all(gcmKeys.map(async (key) => {
        try {
            return await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: base64urlToArrayBuffer(messagePack.proof.gcm.iv),
                },
                key,
                base64urlToArrayBuffer(messagePack.proof.gcm.ciphertext)
            );
        } catch (error) {
            return null;
        }
    }))
    console.log("Decryption results for proof validation:", results);
    const result: ArrayBuffer | null = results.find(res => res !== null) ?? null;
    console.log("Proof decryption result:", result);
    return result;
}

export const getCredentialIdForUser = async (username: string) => {
    const credentialIds = await getCredentialIds(username);
    if (credentialIds.length === 0) {
        throw new Error("No credentials available for signing");
    }
    const credentialId = credentialIds[0]; // For simplicity, we just use the first credential. In a real app, you would let the user choose.
    return credentialId;
}