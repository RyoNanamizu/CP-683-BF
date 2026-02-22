export type CreateCredentialOptions = {
    challenge: string;
    rp: {
        name: string;
        id: string;
    };
    user: {
        id: string;
        name: string;
    };
    pubKeyCredParams: Array<{
        type: "public-key";
        alg: number;
    }>;
    authenticatorSelection: {
        userVerification: "required";
    };
    attestation: "direct";
};

export type ErrorResponse = {
    error: string;
};
export type LoginChallenge = {
    description: string;
    challenge: string;
    rpId: string;
    allowCredentials: Array<{
        type: "public-key";
        id: string;
    }>;
    userVerification: string;
};

export interface MessagePack {
    meta: Meta;
    message: Message;
    signature: string;
    proof: Proof;
}

export interface Meta {
    version: string;
    hash_algorithm: string;
    curve: string;
}

export interface Message {
    payload: string;
    nonce: string;
    timestamp: string;
}

export interface Proof {
    gcm: Gcm;
    inner_hash: string;
}

export interface Gcm {
    ciphertext: string;
    iv: string;
}