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