import { base64urlToArrayBuffer, fetchChallenge, fromBufferSource, generateKeyPair, type LoginChallenge } from "@repo/shared";
import { Button } from "antd"

const generateKey = async (username: string) => {
    const challengeRes = await fetchChallenge(username, "/api/auth/challenge") as LoginChallenge
    const publicKeyCredential = await navigator.credentials.get({
        publicKey: {
            challenge: base64urlToArrayBuffer(challengeRes.challenge),
            rpId: challengeRes.rpId,
            allowCredentials: challengeRes.allowCredentials.map(cred => ({
                type: cred.type,
                id: base64urlToArrayBuffer(cred.id),
            })),
            extensions: {
                "prf": {
                    "eval": {
                        "first": crypto.getRandomValues(new Uint8Array(32))
                    }
                }
            }
        },
    }) as PublicKeyCredential | null;
    if (!publicKeyCredential) throw new Error("No credential returned");
    const extensionResults = publicKeyCredential.getClientExtensionResults();
    const derivedKey = extensionResults?.prf?.results?.first;
    if (!derivedKey) throw new Error("PRF extension did not return a derived key");
    const { privateKey, publicKey } = generateKeyPair(fromBufferSource(derivedKey));
    console.log(privateKey, publicKey);
};

type GenerateKeyProps = {
    username: string;
}

export const GenerateKey: React.FC<GenerateKeyProps> = (props) => {
    return <Button type="primary" onClick={() => generateKey(props.username)}>Generate</Button>
}