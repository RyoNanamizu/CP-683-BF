import { base64urlToArrayBuffer, generateKeyPair, fromBufferSource, generateLRSWithoutFakeKeys, toBytes, hexToBytes, generateLRSFromRawMessageWithoutFakeKeys, type MessagePack, uint8ArrayToBase64, fetchChallenge, type ErrorResponse, type LoginChallenge, verifyLRSFromRawMessage, bytesToLRS, LRSToBytes, bytesToRawLRS, SESSION_TOKEN_KEY } from "@repo/shared";
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
    return result
}

export const ValidateMessagePack = async (messagePack: MessagePack): Promise<boolean> => {
    // Step 1, confirming metadata
    if (messagePack.meta.version !== "1.0" ||
        messagePack.meta.hash_algorithm !== "SHA-256" ||
        messagePack.meta.curve !== "ristretto255") {
        return false;
    }
    // Step 2, combian message
    const message = messagePack.message.payload + messagePack.message.timestamp + messagePack.message.nonce;
    const rawMessage = toBytes(message);
    const internalLRSHash = new Uint8Array(base64urlToArrayBuffer(messagePack.proof.inner_hash));
    if (!internalLRSHash || internalLRSHash.byteLength !== SHA256HASH_SIZE) {
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
    const result: ArrayBuffer | null = results.find(res => res !== null) ?? null;
    return result;
}

export type PostMessagePackResponse = {
    success: boolean;
    error?: string;
    id?: string;
    timestamp?: string;
}


export const postMessagePack = async (message: string, credentialId: string, memo: string): Promise<PostMessagePackResponse> => {
    const response = await fetch("/api/message", {
        method: "POST",
        headers: getAuthedHeader({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            "messagePack": message,
            "memo": memo,
            "credentialId": credentialId
        }),
    })
    if (!response.ok || response.status >= 300) {
        const errorData = await response.json() as ErrorResponse;
        throw new Error(`Failed to post message pack: ${errorData.error}`);
    }
    const responseData = await response.json() as { id: string, timestamp: string };
    return {
        success: true,
        id: responseData.id,
        timestamp: responseData.timestamp,
    }
}


export const getAuthedHeader = (headers: Record<string, string>) => {
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!sessionToken) throw new Error("No session token found");
    Object.defineProperty(headers, "x-session-token", {
        value: `${sessionStorage.getItem(SESSION_TOKEN_KEY)}`,
        enumerable: true,
    });
    return headers;
}

export type TypeGetMessagePackListResponseTypeItem = {
    "id": string,
    "messagePack": string,
    "memo": string,
    "credentialId": string,
    "owner": string,
    "timestamp": string
}

export const getMessagePackListFromBackend = async (username: string): Promise<{
    messagePacks: TypeGetMessagePackListResponseTypeItem[];
    count: number;
}> => {
    const response = await fetch("/api/message/list/by_username/" + encodeURIComponent(username), {
        headers: getAuthedHeader({ "Content-Type": "application/json" }),
    });
    if (!response.ok || response.status >= 300) {
        const errorData = await response.json() as ErrorResponse;
        throw new Error(`Failed to fetch message pack list: ${errorData.error}`);
    }
    const responseData = await response.json() as { messagePacks: TypeGetMessagePackListResponseTypeItem[], count: number };
    return responseData;
}

export const transferOwnershipForBackend = async (id: string, newOwner: string): Promise<boolean> => {
    const response = await fetch(`/api/message/by_id/${id}/owner`, {
        method: "PUT",
        headers: getAuthedHeader({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            "newOwner": newOwner
        }),
    });
    if (!response.ok || response.status >= 300) {
        const errorData = await response.json() as ErrorResponse;
        throw new Error(`Failed to transfer ownership: ${errorData.error}`);
    }
    return true;
}