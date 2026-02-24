// import type { MessagePack } from "@repo/shared";
import { Splitter, Flex, List, Descriptions, type DescriptionsProps, Button, Badge } from "antd";
import { getMessagePackStorageKey, getValidationResultStorageKey, STORAGE_KEY_MESSAGE_PACKS_LIST, STORAGE_KEY_RECEIVED_REQUESTS_LIST, STORAGE_KEY_SENT_REQUESTS_LIST } from "./constants";
import { useEffect, useState } from "react";
import { getCredentialIdForUser, getProofForReceiver, ValidateMessagePack } from "./utils";
import { base64urlToArrayBuffer, bytesToRawLRS, LRSFromRawLRS, uint8ArrayEquals, uint8ArrayToBase64, verifyLRS, type MessagePack } from "@repo/shared";
import type { PresetStatusColorType } from "antd/es/_util/colors";

const Desc: React.FC<Readonly<{ text?: string | number }>> = (props) => (
    <Flex justify="center" align="center" style={{ height: '100%' }}>
        {props.text}
    </Flex>
);

/* type MessagePackData = {
    id: number;
    content: MessagePack;
    owner: string;
    timestamp: string;
}
 */

const getMessagePackList = () => {
    const messagePacksList = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGE_PACKS_LIST) ?? "[]") as string[];
    return messagePacksList;
}

const getRequestList = () => {
    const messagePacksList = JSON.parse(localStorage.getItem(STORAGE_KEY_SENT_REQUESTS_LIST) ?? "[]") as string[];
    return messagePacksList;
}

const getReceivedRequestList = () => {
    const messagePacksList = JSON.parse(localStorage.getItem(STORAGE_KEY_RECEIVED_REQUESTS_LIST) ?? "[]") as string[];
    return messagePacksList;
}


const convertMessagePackToDisplayData = (messagePack: MessagePack, memo: string): DescriptionsProps['items'] => {
    return [{
        label: "Memo",
        children: memo.length > 0 ? memo : "UNKNOWN",
    }, {
        label: "Time",
        children: messagePack.message.timestamp,
    }, {
        label: "Message",
        children: messagePack.message.payload,
    }]
}

const getValidationResult = async (messagePack: MessagePack) => {
    try {
        return await ValidateMessagePack(messagePack);
    } catch (error) {
        return false;
    }
}

const getProofValidationResult = async (messagePack: MessagePack, username: string) => {
    const credentialId = await getCredentialIdForUser(username);
    const result = getProofForReceiver(messagePack, credentialId);
    return result;
}

const sendValidationRequest = (index: number) => {
    const sentRequestList = getRequestList();
    const messagePackList = getMessagePackList();
    sentRequestList.length = messagePackList.length;
    sentRequestList[index] = "Pending";
    localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
    const receivedRequestList = getReceivedRequestList();
    receivedRequestList.length = messagePackList.length;
    receivedRequestList[index] = "Pending";
    localStorage.setItem(STORAGE_KEY_RECEIVED_REQUESTS_LIST, JSON.stringify(receivedRequestList));
}

const exportMessagePack = async (index: number, memo: string, username: string) => {
    const data = localStorage.getItem(getMessagePackStorageKey(index))
    const credentialId = await getCredentialIdForUser(username);
    if (data === null) return;
    const messagePackData = JSON.parse(data) as MessagePack;
    const messagePackExportData = {
        pack: messagePackData,
        memo: memo,
        credentialId: credentialId,
    }
    const blob = new Blob([JSON.stringify(messagePackExportData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `message_pack_${index}.json`;
    a.click();
    URL.revokeObjectURL(url);
}



const MessagePackDetail = (props: { index: number, memo: string, username: string }) => {
    const data = localStorage.getItem(getMessagePackStorageKey(props.index))
    if (data === null) return <Desc text="No data found for this message pack" />
    const messagePackData = JSON.parse(data) as MessagePack;
    const [validationResult, setValidationResult] = useState<boolean | null>(null);
    useEffect(() => {
        const validate = async () => {
            const result = await getValidationResult(messagePackData);
            setValidationResult(result);
        }
        validate();
    }, [])
    return validationResult !== null && <Flex vertical gap="large" style={{ margin: "16px" }}>
        <Badge.Ribbon color={validationResult ? "green" : "red"} text={validationResult ? "Passed" : "Failed"}>
            <Descriptions layout="horizontal" column={1} bordered title="Message Info" items={convertMessagePackToDisplayData(messagePackData, props.memo)} />
        </Badge.Ribbon>
        <Flex gap="middle">
            <Button 
                color="primary" 
                variant="solid" 
                onClick={async () => {
                    try {
                        await sendValidationRequest(props.index);
                    } catch (error) {
                        console.error("Failed to send validation request:", error);
                    }
                }}
            >
                Identity Confirmation Request
            </Button>
            <Button color="primary" variant="solid" onClick={() => exportMessagePack(props.index, props.memo, props.username)}>Export</Button>
        </Flex>
    </Flex>
}

export const MessagePackList = (props: { username: string }) => {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);
    const messagePackList = getMessagePackList();

    return <Flex vertical gap="large" style={{ minHeight: "350px", padding: "16px" }}>
        <Splitter>
            <Splitter.Panel min="20%">
                <List dataSource={messagePackList} renderItem={(item, index) => <List.Item onClick={() => setCurrentIndex(index)}>{item}</List.Item>} />
            </Splitter.Panel>
            <Splitter.Panel min="20%">
                {currentIndex !== null && <MessagePackDetail index={currentIndex} memo={messagePackList[currentIndex]} username={props.username} />}
            </Splitter.Panel>
        </Splitter >
    </Flex>
}

export const SentValidationRequestList = () => {
    const requestList = getRequestList();
    const messagePackList = getMessagePackList();

    return <Flex vertical gap="large">
        <List dataSource={requestList} renderItem={(item, index) => <List.Item>
            <Flex justify="space-between" style={{ width: "100%" }}>
                <Flex>{messagePackList[index]}</Flex>
                <Flex gap="middle" align="middle">
                    <Flex>{item !== "Passed" && <Button color="primary" variant="solid" onClick={() => validateProof(index)}>Validate</Button>}</Flex>
                    <Flex><Badge status={stateMapping[item] ?? "default"} text={item} /></Flex>
                </Flex>
            </Flex>
        </List.Item>} />
    </Flex>
}

const decryptProof = async (index: number, username: string) => {
    const receivedRequestList = getReceivedRequestList();
    const sentRequestList = getRequestList();
    const data = localStorage.getItem(getMessagePackStorageKey(index))
    if (data === null) {
        receivedRequestList[index] = "Error";
        localStorage.setItem(STORAGE_KEY_RECEIVED_REQUESTS_LIST, JSON.stringify(receivedRequestList));
        return;
    }
    const messagePackData = JSON.parse(data) as MessagePack;
    const result = await getProofValidationResult(messagePackData, username);
    if (result === null) {
        receivedRequestList[index] = "Failed";
    } else {
        sentRequestList[index] = "Replied";
        receivedRequestList[index] = "Passed";
        localStorage.setItem(getValidationResultStorageKey(index), uint8ArrayToBase64(new Uint8Array(result)));
    }
    localStorage.setItem(STORAGE_KEY_RECEIVED_REQUESTS_LIST, JSON.stringify(receivedRequestList));
    localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
}

const validateProof = (index: number) => {
    const proofItem = localStorage.getItem(getValidationResultStorageKey(index));
    const messagePackItem = localStorage.getItem(getMessagePackStorageKey(index));
    const sentRequestList = getRequestList();
    if (proofItem === null) {
        sentRequestList[index] = "Error";
        localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
        return;
    }
    if (messagePackItem === null) {
        sentRequestList[index] = "Error";
        localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
        return;
    }
    const messagePackData = JSON.parse(messagePackItem) as MessagePack;
    const proofRaw = new Uint8Array(base64urlToArrayBuffer(proofItem));
    const rawLRS = bytesToRawLRS(proofRaw);
    const proofPubKeys = rawLRS.ring;
    const signatureRaw = new Uint8Array(base64urlToArrayBuffer(messagePackData.signature));
    const signatureLRSRaw = bytesToRawLRS(signatureRaw);
    const signPubKeys = signatureLRSRaw.ring;
    if (!proofPubKeys.some(key => signPubKeys.some(signKey => uint8ArrayEquals(key, signKey)))) {
        sentRequestList[index] = "Failed";
        localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
        return;
    }
    const message = messagePackData.message.payload + messagePackData.message.timestamp + messagePackData.message.nonce;
    const proofLRS = LRSFromRawLRS(rawLRS);
    const validationResult = verifyLRS(message, proofLRS);
    const state = validationResult ? "Passed" : "Failed";
    sentRequestList[index] = state;
    localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
}

const stateMapping: Record<string, PresetStatusColorType> = {
    "Pending": "warning",
    "Passed": "success",
    "Failed": "error",
    "Error": "error",
    "Refused": "error",
    "Replied": "warning",
}

const refuseProof = (index: number) => {
    const receivedRequestList = getReceivedRequestList();
    const sentRequestList = getRequestList();
    sentRequestList[index] = "Refused";
    receivedRequestList[index] = "Refused";
    localStorage.setItem(STORAGE_KEY_RECEIVED_REQUESTS_LIST, JSON.stringify(receivedRequestList));
    localStorage.setItem(STORAGE_KEY_SENT_REQUESTS_LIST, JSON.stringify(sentRequestList));
}

export const ReceivedValidationRequestList = (props: { username: string }) => {
    const receivedRequestList = getReceivedRequestList();
    const messagePackList = getMessagePackList();


    return <Flex vertical gap="large">
        <List dataSource={receivedRequestList} renderItem={(item, index) => <List.Item>
            <Flex justify="space-between" style={{ width: "100%" }}>
                <Flex gap="large">
                    <Flex>{messagePackList[index]}</Flex>
                </Flex>
                <Flex gap="middle" align="center">
                    {item !== "Passed" && item !== "Refused" && <Button color="primary" variant="solid" onClick={() => decryptProof(index, props.username)}>Validate</Button>}
                    {item !== "Passed" && item !== "Refused" && <Button color="danger" variant="solid" onClick={() => refuseProof(index)}>Refuse or Admit Failure</Button>}
                    <Flex><Badge status={stateMapping[item] ?? "default"} text={item} /></Flex>
                </Flex>
            </Flex>
        </List.Item>} />
    </Flex>
}

