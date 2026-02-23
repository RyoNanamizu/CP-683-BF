import { Alert, Button, Collapse, Flex, Input, type CollapseProps } from "antd"
import { MessagePackList, ReceivedValidationRequestList, SentValidationRequestList } from "./Message";
import { getCredentialIdForUser, getMessagePack } from "./utils";
import { useCallback, useState } from "react";
import type { MessagePack } from "@repo/shared";
import { getMessagePackStorageKey, STORAGE_KEY_CREDENTIAL_ID, STORAGE_KEY_MESSAGE_PACKS_LIST } from "./constants";



const signMessageToMessagePack = async (message: string, username: string, memo: string): Promise<MessagePack> => {
    const credentialId = localStorage.getItem(STORAGE_KEY_CREDENTIAL_ID) ?? (await getCredentialIdForUser(username));
    localStorage.setItem(STORAGE_KEY_CREDENTIAL_ID, credentialId);
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


const SignMessage = (props: Props) => {
    const [message, setMessage] = useState<string>("");
    const [memo, setMemo] = useState<string>("");

    const signMessage = useCallback(() => signMessageToMessagePack(message, props.username, memo), [message, memo, props.username]);

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




const getItems = (props: Props): CollapseProps['items'] => {
    return [
        {
            key: 1,
            label: "Sign a new Message",
            children: <SignMessage username={props.username} />,
        },
        {
            key: 2,
            label: "Message Pack List",
            children: <MessagePackList username={props.username} />,
        },
        {
            key: 3,
            label: "Received Validation Request List",
            children: <ReceivedValidationRequestList />,
        },
        {
            key: 4,
            label: "Sent Validation Request List",
            children: <SentValidationRequestList />,
        }
    ]
}

type Props = {
    username: string
}

export const SignPanel = (props: Props) => {
    const calItems = useCallback((props: Props) => getItems(props), [props]);
    return <Collapse items={calItems(props)} defaultActiveKey={[1]} />
}

