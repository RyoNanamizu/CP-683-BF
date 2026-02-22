import { Alert, Button, Collapse, Flex, Input, type CollapseProps } from "antd"
import { MessagePackList } from "./Message";
import { getCredentialIds, getMessagePack } from "./utils";
import { useCallback, useState } from "react";
import type { MessagePack } from "@repo/shared";

const signMessageToMessagePack = async (message: string, username: string): Promise<MessagePack> => {
    const credentialIds = await getCredentialIds(username);
    if (credentialIds.length === 0) {
        throw new Error("No credentials available for signing");
    }
    const credentialId = credentialIds[0]; // For simplicity, we just use the first credential. In a real app, you would let the user choose.
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const messagePack = await getMessagePack(message, timestamp, nonce, credentialId);
    console.log(messagePack);
    return messagePack;
}


const SignMessage = (props: Props) => {

    const [message, setMessage] = useState<string>("");
    const [memo, setMemo] = useState<string>("");

    return <Flex vertical gap="middle">
        <Flex>
            <Input.TextArea rows={6} placeholder="Enter message to sign" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Flex>
        <Flex vertical gap="small">
            <Alert title="Memo is only for internal use and will not be included in the signed message pack" type="warning" />
            <Input placeholder="Enter a memo (Optional)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Flex>
        <Flex gap="middle">
            <Button color="primary" variant="solid" onClick={() => { signMessageToMessagePack(message, props.username) }}>Generate A New Message Pack</Button>
            <Button color="danger" variant="solid">Clear</Button>
        </Flex>
    </Flex >
}



const getItems = (props: Props): CollapseProps['items'] => {
    return [
        {
            key: 1,
            label: "Sign a new Message",
            children: <SignMessage {...props} />,
        },
        {
            key: 2,
            label: "Show Message Pack List",
            children: <MessagePackList />,
        }
    ]
}

type Props = {
    // You can add props here if needed
    username: string
}

export const SignPanel = (props: Props) => {
    const calItems = useCallback((props: Props) => getItems(props), [props]);
    return <Collapse items={calItems(props)} defaultActiveKey={[1]} />
}

