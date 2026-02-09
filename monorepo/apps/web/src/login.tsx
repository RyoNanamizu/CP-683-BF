import { base64urlToArrayBuffer } from "@repo/shared";
import "antd/dist/reset.css";
import { Button, Input, message, Space } from 'antd';
import { useCallback, useEffect, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";

const USER_EXISTS_ERROR = "Handle already registered" as const;
const SESSION_TOKEN_KEY = "sessionToken" as const;

type CreateCredentialOptions = {
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

type ErrorResponse = {
    error: string;
};

type LoginChallenge = {
    description: string;
    challenge: string;
    rpId: string;
    allowCredentials: Array<{
        type: "public-key";
        id: string;
    }>;
    userVerification: string;
};

// type RegistrationSuccessResponse = {
//     success: boolean;
//     handle: string;
//     credentialId: string;
// };

type LoginSuccessResponse = {
    success: boolean;
    handle: string;
    sessionToken: string;
};

const fetchChallenge = async (handle: string, endpoint: string) => {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
    });
    return res.json() as Promise<CreateCredentialOptions | LoginChallenge | ErrorResponse>;
};

const handleRegistration = async (data: CreateCredentialOptions) => {
    const publicKeyCredential = await navigator.credentials.create({
        publicKey: {
            challenge: base64urlToArrayBuffer(data.challenge),
            rp: { id: document.location.hostname, name: data.rp.name },
            user: {
                id: base64urlToArrayBuffer(data.user.id),
                name: data.user.name,
                displayName: data.user.name,
            },
            pubKeyCredParams: data.pubKeyCredParams,
        },
    }) as PublicKeyCredential | null;

    if (!publicKeyCredential) return;

    const response = publicKeyCredential.response as AuthenticatorAttestationResponse;
    const registerRes = await fetch("/api/register/publickey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id: publicKeyCredential.id,
            response: {
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
                attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))),
            },
        }),
    });

    if (!registerRes.ok) throw new Error(`Failed to register public key: ${registerRes.statusText}`);
};

const handleLogin = async (loginData: LoginChallenge) => {
    const publicKeyCredential = await navigator.credentials.get({
        publicKey: {
            challenge: base64urlToArrayBuffer(loginData.challenge),
            rpId: document.location.hostname,
            allowCredentials: loginData.allowCredentials.map(cred => ({
                type: "public-key",
                id: base64urlToArrayBuffer(cred.id),
            })),
        },
    }) as PublicKeyCredential | null;

    if (!publicKeyCredential) return;

    const response = publicKeyCredential.response as AuthenticatorAssertionResponse;
    const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id: publicKeyCredential.id,
            response: {
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
                authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
                signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
            },
        }),
    });
    if (!sessionRes.ok) throw new Error(`Failed to create session: ${sessionRes.statusText}`);
    return sessionRes.json() as Promise<LoginSuccessResponse>;
};

const getChallenge = (setCurrentUser: React.Dispatch<React.SetStateAction<string | null>>) => (messageApi: MessageInstance) => async (username: string) => {
    try {
        const data = await fetchChallenge(username, "/api/register/challenge");

        if (!("error" in data) || data.error !== USER_EXISTS_ERROR) {
            await handleRegistration(data as CreateCredentialOptions);
        }

        const loginData = await fetchChallenge(username, "/api/auth/challenge");
        if ("error" in loginData) throw new Error(loginData.error);
        const loginResult = await handleLogin(loginData as LoginChallenge);
        if (!loginResult?.success) throw new Error("Login failed");

        messageApi.open({
            type: "success",
            content: `Logged in as ${loginResult.handle}`,
        });

        setCurrentUser(loginResult.handle)

        sessionStorage.setItem(SESSION_TOKEN_KEY, loginResult.sessionToken);
    } catch (error) {
        messageApi.open({
            type: "error",
            content: error instanceof Error ? error.message : "An unexpected error occurred",
        });
    }
};

const fetchProfile = (setCurrentUser: React.Dispatch<React.SetStateAction<string | null>>) => async () => {
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (sessionToken) {
        const res = await fetch("/api/api/user/profile", {
            headers: { "x-session-token": `${sessionToken}` },
        });

        if (res.ok) {
            const profile = await res.json();
            if (profile.success) {
                setCurrentUser(profile.handle);
            }
        }
    }
}

const clearSession = () => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
}


function Login() {
    const [username, setUsername] = useState("");
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [messageApi, contextHolder] = message.useMessage();
    const getChallengeWithMessage = useCallback((username: string) => getChallenge(setCurrentUser)(messageApi)(username), [messageApi]);
    const fetchProfileWithSetter = useCallback(() => fetchProfile(setCurrentUser)(), []);

    useEffect(() => {
        fetchProfileWithSetter();
    }, [fetchProfileWithSetter]);

    return currentUser === null ? (
        <div style={{ padding: 24 }}>
            {contextHolder}
            <h1>Login</h1>
            <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="User Name" value={username} onChange={e => setUsername(e.target.value)} />
                <Button type="primary" onClick={() => getChallengeWithMessage(username)}>Login</Button>
            </Space.Compact>
        </div>
    ) : (
        <div style={{ padding: 24 }}>
            {contextHolder}
            <h1>Welcome, {currentUser}</h1>
            <Button type="primary" onClick={() => { clearSession(); setCurrentUser(null); }}>Logout</Button>
        </div>
    );
}

export { Login };