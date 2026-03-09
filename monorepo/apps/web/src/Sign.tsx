import { Alert, Button, Collapse, Flex, Input, type CollapseProps } from "antd"
import { MessagePackList, ReceivedValidationRequestList, SentValidationRequestList } from "./Message";
import { getMessagePack, getMessagePackListFromBackend, getReceivedRequestsList, getSentRequestsList, postMessagePack, type FetchSentRequestsListResponseItem, type TypeGetMessagePackListResponseTypeItem } from "./utils";
import { useCallback, useEffect, useState } from "react";
import type { MessagePack } from "@repo/shared";



const signMessageToMessagePack = async (message: string, credentialId: string, memo: string): Promise<MessagePack> => {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const messagePack = await getMessagePack(message, timestamp, nonce, credentialId);
    postMessagePack(JSON.stringify(messagePack), credentialId, memo);
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

type ItemProps = {
    username: string
    credentialId: string
    onSentConfirmed: () => void
    onConfirmed: () => void
    onReceivedConfirmed: () => void
    receivedRequestList: FetchSentRequestsListResponseItem[],
    requestList: FetchSentRequestsListResponseItem[],
    messagePackList: TypeGetMessagePackListResponseTypeItem[]
}



const getItems = (props: ItemProps): CollapseProps['items'] => {
    return [
        {
            key: 1,
            label: "Sign a new Message",
            children: <SignMessage username={props.username} credentialId={props.credentialId} />,
        },
        {
            key: 2,
            label: "Message Pack List",
            children: <MessagePackList
                onConfirmed={props.onConfirmed}
                username={props.username}
                credentialId={props.credentialId}
                onSentConfirmed={props.onSentConfirmed}
                messagePackList={props.messagePackList} />,
        },
        {
            key: 3,
            label: "Received Validation Request List",
            children: <ReceivedValidationRequestList
                receivedRequestList={props.receivedRequestList}
                username={props.username}
                credentialId={props.credentialId}
                onConfirmed={props.onReceivedConfirmed}
                messagePackList={props.messagePackList} />,
        },
        {
            key: 4,
            label: "Sent Validation Request List",
            children: <SentValidationRequestList username={props.username} messagePackList={props.messagePackList} requestList={props.requestList} />,
        }
    ]
}

const getMessagePackList = async (username: string) => {
    const messagePacksList = (await getMessagePackListFromBackend(username)).messagePacks
    return messagePacksList;
}

const getRequestList = async () => (await getSentRequestsList()).requests;

const fetchMessagePackList = (setMessagePackList: React.Dispatch<React.SetStateAction<TypeGetMessagePackListResponseTypeItem[]>>) => async (username: string) => {
    const messagePackList = await getMessagePackList(username);
    setMessagePackList(messagePackList);
}

const fetchRequestList = async (setRequestList: React.Dispatch<React.SetStateAction<FetchSentRequestsListResponseItem[]>>) => {
    const requestList = await getRequestList();
    setRequestList(requestList);
}

const getReceivedRequestList = async (setReceivedRequestList: React.Dispatch<React.SetStateAction<FetchSentRequestsListResponseItem[]>>) => {
    const messagePacksList = (await getReceivedRequestsList()).requests;
    setReceivedRequestList(messagePacksList);
}



export const SignPanel = (props: {
    username: string
    credentialId: string
}) => {
    const [messagePackList, setMessagePackList] = useState<TypeGetMessagePackListResponseTypeItem[]>([]);
    const [requestList, setRequestList] = useState<FetchSentRequestsListResponseItem[]>([]);
    const [receivedRequestList, setReceivedRequestList] = useState<FetchSentRequestsListResponseItem[]>([]);
    useEffect(() => {
        fetchMessagePackList(setMessagePackList)(props.username);
    }, [props.username])
    useEffect(() => {
        fetchRequestList(setRequestList);
    }, [])
    useEffect(() => {
        getReceivedRequestList(setReceivedRequestList);
    }, [])

    const onSentConfirmed = () => {
        fetchRequestList(setRequestList);
    }

    const onConfirmed = () => {
        fetchMessagePackList(setMessagePackList)(props.username);
    }

    const onReceivedConfirmed = () => {
        getReceivedRequestList(setReceivedRequestList);
    }


    const calItems = useCallback((props: {
        username: string
        credentialId: string
    }) => getItems({
        ...props,
        requestList,
        messagePackList,
        receivedRequestList,
        onSentConfirmed,
        onConfirmed,
        onReceivedConfirmed
    }), [props, requestList, messagePackList, onSentConfirmed]);
    return <Collapse items={calItems(props)} defaultActiveKey={[1]} />
}

