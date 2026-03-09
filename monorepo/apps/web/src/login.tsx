import { base64urlToArrayBuffer, fetchChallenge, PRF_NOT_ENABLED_ERROR, SESSION_TOKEN_KEY, USER_EXISTS_ERROR } from "@repo/shared";
import "antd/dist/reset.css";
import { Button, Flex, Input, message, Space } from 'antd';
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import type { CreateCredentialOptions, LoginChallenge } from "@repo/shared"
import { SignPanel } from "./Sign";
import { postMessagePack } from "./utils";




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
    return {
        result: await sessionRes.json() as LoginSuccessResponse,
        credentialId: publicKeyCredential.id,
    };
};

const getChallenge = (setCurrentUser: React.Dispatch<React.SetStateAction<string | null>>, setCurrentCredentialId: React.Dispatch<React.SetStateAction<string | null>>) => (messageApi: MessageInstance) => async (username: string) => {
    try {
        const data = await fetchChallenge(username, "/api/register/challenge");

        if (!("error" in data) || data.error !== USER_EXISTS_ERROR) {
            await handleRegistration(data as CreateCredentialOptions);
        }

        const loginData = await fetchChallenge(username, "/api/auth/challenge");
        if ("error" in loginData) throw new Error(loginData.error);
        const { result: loginResult, credentialId } = await handleLogin(loginData as LoginChallenge) || {};
        if (!loginResult?.success || !credentialId) throw new Error("Login failed");

        messageApi.open({
            type: "success",
            content: `Logged in as ${loginResult.handle}`,
        });

        setCurrentUser(loginResult.handle)
        setCurrentCredentialId(credentialId);

        sessionStorage.setItem(SESSION_TOKEN_KEY, loginResult.sessionToken);
    } catch (error) {
        messageApi.open({
            type: "error",
            content: error instanceof Error ? error.message : "An unexpected error occurred",
        });
    }
};

const fetchProfile = (setCurrentUser: React.Dispatch<React.SetStateAction<string | null>>) => (setCurrentCredentialId: React.Dispatch<React.SetStateAction<string | null>>) => async () => {
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (sessionToken) {
        const res = await fetch("/api/session", {
            headers: { "x-session-token": `${sessionToken}` },
        });

        if (res.ok) {
            const profile = await res.json();
            if (profile.success) {
                setCurrentUser(profile.username);
                setCurrentCredentialId(profile.credentialId);
            }
        }
    }
}

const clearSession = () => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
}


function Login() {
    const [usernameInputText, setUsernameInputText] = useState("");
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [messageApi, contextHolder] = message.useMessage();
    const getChallengeWithMessage = useCallback((username: string) => getChallenge(setCurrentUser, setCurrentCredentialId)(messageApi)(username), [messageApi]);
    const fetchProfileWithSetter = useCallback(() => fetchProfile(setCurrentUser)(setCurrentCredentialId)(), []);
    const [currentCredentialId, setCurrentCredentialId] = useState<string | null>(null);

    useEffect(() => {
        if (sessionStorage.getItem(SESSION_TOKEN_KEY)) {
            fetchProfileWithSetter();
        } else {
            setCurrentUser(null);
        }
    }, []);

    useEffect(() => {
        fetchProfileWithSetter();
    }, [fetchProfileWithSetter]);

    const hiddenFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        hiddenFileRef.current?.addEventListener("change", async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;
            if (file.type !== "application/json" && !file.name.endsWith('.json')) {
                new Error("Invalid file type. Please select a JSON file.");
                return;
            }
            try {
                const text = await file.text();
                const jsonContent = JSON.parse(text);

                const pack = jsonContent.pack as string;
                const memo = jsonContent.memo as string;
                const credentialId = jsonContent.credentialId as string;

                if (!pack || !memo || !credentialId) {
                    throw new Error("Invalid file format. Missing required fields.");
                }

                await postMessagePack(credentialId, pack, memo);


            } catch (e) {
                throw e
            }

        })
    }, []);

    return currentUser === null ? (
        <Flex vertical gap="large">
            {contextHolder}
            <h1>Login</h1>
            <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="User Name" value={usernameInputText} onChange={e => setUsernameInputText(e.target.value)} />
                <Button type="primary" onClick={() => getChallengeWithMessage(usernameInputText)}>Login</Button>
            </Space.Compact>
        </Flex>
    ) : (
        <Flex vertical gap="large">
            {contextHolder}
            <h1>Welcome, {currentUser}</h1>
            <Flex gap="middle" justify="center">
                <Button type="primary" onClick={() => { clearSession(); setCurrentUser(null); }}>Logout</Button>
                <input accept=".json" type="file" id="hiddenFile" style={{ display: "none" }} ref={hiddenFileRef} />
                <Button type="primary" onClick={() => {
                    hiddenFileRef.current?.click();
                }}>Import Message Pack</Button>
            </Flex>
            {currentCredentialId !== null && <SignPanel username={currentUser} credentialId={currentCredentialId} />}
        </Flex>
    );
}

export function LoginWrapper() {
    return <Flex gap="middle" vertical wrap style={{ width: "100%" }}>
        <Login />
    </Flex>
}


