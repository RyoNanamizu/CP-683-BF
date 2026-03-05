import { Alert, Button, Collapse, Flex, Input, type CollapseProps } from "antd"
import { MessagePackList, ReceivedValidationRequestList, SentValidationRequestList } from "./Message";
import { getMessagePack } from "./utils";
import { useCallback, useState } from "react";
import type { MessagePack } from "@repo/shared";
import { getMessagePackStorageKey, STORAGE_KEY_MESSAGE_PACKS_LIST } from "./constants";



const signMessageToMessagePack = async (message: string, credentialId: string, memo: string): Promise<MessagePack> => {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const messagePack = await getMessagePack(message, timestamp, nonce, credentialId);
    const currentPacks = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGE_PACKS_LIST) ?? "[]") as string[];
    currentPacks.push(memo.length > 0 ? memo : 'UNKNOWN');
    const index = currentPacks.length - 1;
    localStorage.setItem(STORAGE_KEY_MESSAGE_PACKS_LIST, JSON.stringify(currentPacks));
    localStorage.setItem(getMessagePackStorageKey(index), JSON.stringify(messagePack));
    return messagePack;
}


const SignMessage = (props: {
    username: string
    credentialId: string
}) => {
    const [message, setMessage] = useState<string>("");
    const [memo, setMemo] = useState<string>("");

    const signMessage = useCallback(() => signMessageToMessagePack(message, props.credentialId, memo), [message, memo, props.credentialId]);

    return <Flex vertical gap="middle">
        <Flex>
            <Input.TextArea rows={6} placeholder="Enter message to sign" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Flex>
        <Flex vertical gap="small">
            <Alert title="Memo is only for internal use and will not be included in the signed message pack" type="warning" />
            <Input placeholder="Enter a memo (Optional)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Flex>
        <Flex gap="middle">
            <Button color="primary" variant="solid" onClick={signMessage}>Generate A New Message Pack</Button>
            <Button color="danger" variant="solid">Clear</Button>
        </Flex>
    </Flex >
}




const getItems = (props: {
    username: string
    credentialId: string
}): CollapseProps['items'] => {
    return [
        {
            key: 1,
            label: "Sign a new Message",
            children: <SignMessage username={props.username} credentialId={props.credentialId} />,
        },
        {
            key: 2,
            label: "Message Pack List",
            children: <MessagePackList username={props.username} credentialId={props.credentialId} />,
        },
        {
            key: 3,
            label: "Received Validation Request List",
            children: <ReceivedValidationRequestList username={props.username} credentialId={props.credentialId} />,
        },
        {
            key: 4,
            label: "Sent Validation Request List",
            children: <SentValidationRequestList />,
        }
    ]
}


export const SignPanel = (props: {
    username: string
    credentialId: string
}) => {
    const calItems = useCallback((props: {
        username: string
        credentialId: string
    }) => getItems(props), [props]);
    return <Collapse items={calItems(props)} defaultActiveKey={[1]} />
}

