// import type { MessagePack } from "@repo/shared";
import { Splitter, Flex, List, Descriptions, type DescriptionsProps, Button, Badge, Input } from "antd";
import { useEffect, useState } from "react";
import { getMessagePackById, getProofForReceiver, postValidationRequest, putReceivedValidationRequest, putSentValidationRequest, transferOwnershipForBackend, ValidateMessagePack, type FetchSentRequestsListResponseItem, type TypeGetMessagePackListResponseTypeItem } from "./utils";
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

const getProofValidationResult = async (credentialId: string, messagePack: MessagePack) => {
    const result = getProofForReceiver(messagePack, credentialId);
    return result;
}

const exportMessagePack = async (credentialId: string, index: number, memo: string, messagePackData: MessagePack) => {
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

const handleTransferOwnership = (setEditingFlag: React.Dispatch<React.SetStateAction<boolean>>) => async (id: string, newOwner: string) => {
    const result = await transferOwnershipForBackend(id, newOwner);
    setEditingFlag(result);
}

const TransferOwnership = (props: { id: string, onConfirmed: () => void }) => {
    const [editingFlag, setEditingFlag] = useState(false)
    const [newOwner, setNewOwner] = useState("")

    return editingFlag ?
        <Flex gap="small">
            <Input placeholder="New Owner's Username" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />
            <Button color="danger" variant="solid" onClick={() => {
                handleTransferOwnership(setEditingFlag)(props.id, newOwner);
                props.onConfirmed();
            }}>Confirm</Button>
            <Button color="primary" variant="solid" onClick={() => { setEditingFlag(false) }}>Cancel</Button>
        </Flex>
        :
        <Flex><Button color="danger" variant="solid" onClick={() => { setEditingFlag(true) }}>Transfer Ownership</Button></Flex>

}

const handleSendRequest = async (id: string, username: string, onConfirmed: () => void) => {
    const result = await postValidationRequest(id, username)
    if (result) {
        onConfirmed();
    }
}

const SendRequest = (props: { id: string, onConfirmed: () => void }) => {
    const [editingFlag, setEditingFlag] = useState(false)
    const [receiver, setReceiver] = useState("")

    return editingFlag ?
        <Flex gap="small">
            <Input placeholder="Receiver's Username" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
            <Button color="primary" variant="solid" onClick={() => {
                handleSendRequest(props.id, receiver, props.onConfirmed);
                setEditingFlag(false);
            }}>Submit</Button>
            <Button color="danger" variant="solid" onClick={() => { setEditingFlag(false) }}>Cancel</Button>
        </Flex>
        :
        <Flex><Button color="primary" variant="solid" onClick={() => { setEditingFlag(true) }}>Identity Confirmation Request</Button></Flex>

}

const MessagePackDetail = (props: { index: number, memo: string, username: string, credentialId: string, data: string | null, messageId: string, onConfirmed: () => void, onSentConfirmed: () => void }) => {
    if (props.data === null) return <Desc text="No data found for this message pack" />
    const messagePackData = JSON.parse(props.data) as MessagePack;
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
            <TransferOwnership id={props.messageId} onConfirmed={props.onConfirmed} />
            <SendRequest id={props.messageId} onConfirmed={props.onSentConfirmed} />
            <Button color="primary" variant="solid" onClick={() => exportMessagePack(props.credentialId, props.index, props.memo, messagePackData)}>Export To File</Button>
        </Flex>
    </Flex>
}

const mappingMessageMapList = (messagePackList: TypeGetMessagePackListResponseTypeItem[]): string[] => messagePackList.map(item => item.memo.length > 0 ? item.memo : "UNKNOWN");



export const MessagePackList = (props: { messagePackList: TypeGetMessagePackListResponseTypeItem[], username: string, credentialId: string, onSentConfirmed: () => void, onConfirmed: () => void }) => {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);


    const messagePackListForDisplay = mappingMessageMapList(props.messagePackList);


    return <Flex vertical gap="large" style={{ minHeight: "350px", padding: "16px" }}>
        <Splitter>
            <Splitter.Panel min="20%">
                <List dataSource={messagePackListForDisplay} renderItem={(item, index) => <List.Item onClick={() => setCurrentIndex(index)}>{item}</List.Item>} />
            </Splitter.Panel>
            <Splitter.Panel min="20%">
                {currentIndex !== null && <MessagePackDetail
                    onConfirmed={() => {
                        props.onConfirmed();
                        setCurrentIndex(null);
                    }}
                    onSentConfirmed={props.onSentConfirmed}
                    messageId={props.messagePackList[currentIndex].id}
                    data={props.messagePackList[currentIndex]?.messagePack.length > 0 ? props.messagePackList[currentIndex].messagePack : null}
                    index={currentIndex}
                    memo={props.messagePackList[currentIndex].memo}
                    username={props.username}
                    credentialId={props.credentialId} />}
            </Splitter.Panel>
        </Splitter >
        <Flex><Button color="primary" variant="solid" onClick={props.onConfirmed}>Refresh</Button></Flex>
    </Flex>
}


export const SentValidationRequestList = (props: { username: string, requestList: FetchSentRequestsListResponseItem[], messagePackList: TypeGetMessagePackListResponseTypeItem[], onConfirmed: () => void }) => {
    return <Flex vertical gap="large">
        <List dataSource={props.requestList} renderItem={(item, index) => <List.Item>
            <Flex justify="space-between" style={{ width: "100%" }}>
                <Flex>{props.messagePackList[index]?.memo || "UNKNOWN"}</Flex>
                <Flex gap="middle" align="middle">
                    <Flex>
                        {item.status === "Replied" &&
                            <Button
                                color="primary"
                                variant="solid"
                                onClick={() => validateProof(item.messagePackId, item.responsePayload ?? "", item.id)}>
                                Validate</Button>}
                    </Flex>
                    <Flex>
                        <Badge status={stateMapping[item?.status ?? "default"] ?? "default"} text={item?.status ?? "default"} />
                    </Flex>
                </Flex>
            </Flex>
        </List.Item>} />
        <Flex><Button color="primary" variant="solid" onClick={props.onConfirmed} >Refresh</Button></Flex>
    </Flex>
}

const decryptProof = async (requestId: string, messagePackId: string) => {
    const data = (await getMessagePackById(messagePackId)).messagePack;
    const messagePackDataRaw = data.messagePack
    const messagePackData = messagePackDataRaw.length > 0 ? JSON.parse(messagePackDataRaw) as MessagePack : null;
    if (messagePackData === null) {
        new Error("No message pack data found for this validation request. It might be still pending or an error occurred.");
        putReceivedValidationRequest(requestId, 'Error');
        return;
    }
    const result = await getProofValidationResult(data.credentialId, messagePackData);
    if (result === null) {
        new Error("No proof found for this validation request. It might be still pending or an error occurred.");
        putReceivedValidationRequest(requestId, 'Error');
    } else {
        putSentValidationRequest(requestId, 'respond', uint8ArrayToBase64(new Uint8Array(result)));
    }
}

const validateProof = async (messagePackId: string, proof: string, requestId: string) => {
    const data = (await getMessagePackById(messagePackId)).messagePack;
    const messagePackDataRaw = data.messagePack
    const messagePackData = messagePackDataRaw.length > 0 ? JSON.parse(messagePackDataRaw) as MessagePack : null;
    if (proof.length <= 0) {
        new Error("No proof found for this validation request. It might be still pending or an error occurred.");
        return;
    }
    if (messagePackData === null) {
        new Error("No message pack data found for this validation request. It might be still pending or an error occurred.");
        return;
    }
    const proofRaw = new Uint8Array(base64urlToArrayBuffer(proof));
    const rawLRS = bytesToRawLRS(proofRaw);
    const proofPubKeys = rawLRS.ring;
    const signatureRaw = new Uint8Array(base64urlToArrayBuffer(messagePackData.signature));
    const signatureLRSRaw = bytesToRawLRS(signatureRaw);
    const signPubKeys = signatureLRSRaw.ring;
    if (!proofPubKeys.some(key => signPubKeys.some(signKey => uint8ArrayEquals(key, signKey)))) {
        putReceivedValidationRequest(requestId, 'Failed')
        return;
    }
    const message = messagePackData.message.payload + messagePackData.message.timestamp + messagePackData.message.nonce;
    const proofLRS = LRSFromRawLRS(rawLRS);
    const validationResult = verifyLRS(message, proofLRS);
    putReceivedValidationRequest(requestId, validationResult ? 'Passed' : 'Failed')

}

const stateMapping: Record<string, PresetStatusColorType> = {
    "Pending": "warning",
    "Passed": "success",
    "Failed": "error",
    "Error": "error",
    "Refused": "error",
    "Replied": "warning",
}

const refuseProof = async (requestId: string) => {
    await putSentValidationRequest(requestId, 'refuse');
}

export const ReceivedValidationRequestList = (props: {
    receivedRequestList: FetchSentRequestsListResponseItem[],
    username: string,
    credentialId: string,
    messagePackList: TypeGetMessagePackListResponseTypeItem[]
    onConfirmed: () => void
}) => {
    return <Flex vertical gap="large">
        <List dataSource={props.receivedRequestList} renderItem={(item) => <List.Item>
            <Flex justify="space-between" style={{ width: "100%" }}>
                <Flex gap="large">
                    <Flex>{item.createdAt}</Flex>
                </Flex>
                <Flex gap="middle" align="center">
                    {item.status === "Pending" &&
                        <Button color="primary" variant="solid" onClick={() => {
                            decryptProof(item.id, item.messagePackId)
                            props.onConfirmed();
                        }}>
                            Validate
                        </Button>}
                    {item.status === "Pending" && <Button color="danger" variant="solid" onClick={() => {
                        refuseProof(item.id)
                        props.onConfirmed();
                    }}>Refuse or Admit Failure</Button>}
                    <Flex><Badge status={stateMapping[item.status] ?? "default"} text={item.status} /></Flex>
                </Flex>
            </Flex>
        </List.Item>} />
        <Flex><Button color="primary" variant="solid" onClick={props.onConfirmed}>Refresh</Button></Flex>
    </Flex>
}

