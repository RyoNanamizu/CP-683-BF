import { base64urlToArrayBuffer, fetchChallenge, PRF_NOT_ENABLED_ERROR, SESSION_TOKEN_KEY, USER_EXISTS_ERROR } from "@repo/shared";
import "antd/dist/reset.css";
import { Button, Flex, Input, message, Space } from 'antd';
import { useCallback, useEffect, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import type { CreateCredentialOptions, LoginChallenge } from "@repo/shared"
import { GenerateKey } from "./generateKey";
import { SignPanel } from "./Sign";




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
            extensions: {
                "prf": {}
            }
        },
    }) as PublicKeyCredential | null;

    if (!publicKeyCredential) return;

    const clientExtensions = publicKeyCredential.getClientExtensionResults();

    if (!(clientExtensions.prf && clientExtensions.prf.enabled)) throw new Error(PRF_NOT_ENABLED_ERROR);

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
        <Flex vertical gap="large">
            {contextHolder}
            <h1>Login</h1>
            <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="User Name" value={username} onChange={e => setUsername(e.target.value)} />
                <Button type="primary" onClick={() => getChallengeWithMessage(username)}>Login</Button>
            </Space.Compact>
        </Flex>
    ) : (
        <Flex vertical gap="large">
            {contextHolder}
            <h1>Welcome, {currentUser}</h1>
            <Flex gap="middle" justify="center">
                <Button type="primary" onClick={() => { clearSession(); setCurrentUser(null); }}>Logout</Button>
                <GenerateKey username={currentUser} />
            </Flex>
            <SignPanel username={currentUser} />
        </Flex>
    );
}

export function LoginWrapper() {
    return <Flex gap="middle" vertical wrap style={{ width: "100%" }}>
        <Login />
    </Flex>
}


