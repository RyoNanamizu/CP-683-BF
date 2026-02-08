import { base64urlToArrayBuffer } from "@repo/shared";
import "antd/dist/reset.css";
import { Button, Input, message, Space } from 'antd';
import { useCallback, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";

const USER_EXISTS_ERROR = "Handle already registered" as const;

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

// type LoginSuccessResponse = {
//     success: boolean;
//     handle: string;
//     sessionToken: string;
// };

const getChallenge = (messageApi: MessageInstance) => async (username: string) => {
    const res = await fetch("/api/register/challenge", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            handle: username,

        }),
    });
    const data: CreateCredentialOptions | ErrorResponse = await res.json();
    if ("error" in data) {
        if (data.error === USER_EXISTS_ERROR) {
            const loginRes = await fetch("/api/auth/challenge", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    handle: username,
                }),
            });
            const loginData: LoginChallenge | ErrorResponse = await loginRes.json();
            if ("error" in loginData) {
                messageApi.open({
                    type: "error",
                    content: loginData.error,
                })
                return;
            } else {
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
                if (publicKeyCredential) {
                    const response = publicKeyCredential.response as AuthenticatorAssertionResponse;
                    await fetch("/api/auth/session", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            id: publicKeyCredential.id,
                            response: {
                                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
                                authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
                                signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
                            },
                        }),
                    })
                }
                return loginData.challenge;
            }
        }
        messageApi.open({
            type: "error",
            content: data.error,
        })
        return;
    } else {
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
        if (publicKeyCredential) {
            const response = publicKeyCredential.response as AuthenticatorAttestationResponse;
            await fetch("/api/register/publickey", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: publicKeyCredential.id,
                    response: {
                        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
                        attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))),
                    },
                }),
            })
        }
        return data.challenge;
    }
}


function Login() {
    const [username, setUsername] = useState("");
    const [messageApi, contextHolder] = message.useMessage();
    const getChallengeWithMessage = useCallback((username: string) => getChallenge(messageApi)(username), [messageApi]);

    return (
        <div style={{ padding: 24 }}>
            {contextHolder}
            <h1>Login</h1>
            <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="User Name" value={username} onChange={e => setUsername(e.target.value)} />
                <Button type="primary" onClick={() => getChallengeWithMessage(username)}>Login</Button>
            </Space.Compact>
        </div>
    );
}

export { Login };