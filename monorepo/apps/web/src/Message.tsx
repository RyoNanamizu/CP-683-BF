// import type { MessagePack } from "@repo/shared";
import { Splitter, Flex, List, Descriptions, type DescriptionsProps } from "antd";
import { getMessagePackStorageKey, STORAGE_KEY_MESSAGE_PACKS_LIST } from "./constants";
import { useState } from "react";
import type { MessagePack } from "../../../packages/shared/dist/types";

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

const MessagePackDetail = (props: { index: number, memo: string }) => {
    const data = localStorage.getItem(getMessagePackStorageKey(props.index))
    if (data === null) return <Desc text="No data found for this message pack" />
    const messagePackData = JSON.parse(data) as MessagePack;
    return <Flex vertical gap="large" style={{ margin: "16px" }}>
        <Descriptions layout="horizontal" column={1} bordered title="Message Info" items={convertMessagePackToDisplayData(messagePackData, props.memo)} />
    </Flex>
}

export const MessagePackList = () => {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);
    const messagePackList = getMessagePackList();

    return <Flex>
        <Splitter>
            <Splitter.Panel min="20%">
                <List dataSource={messagePackList} renderItem={(item, index) => <List.Item onClick={() => setCurrentIndex(index)}>{item}</List.Item>} />
            </Splitter.Panel>
            <Splitter.Panel min="20%">
                {currentIndex !== null && <MessagePackDetail index={currentIndex} memo={messagePackList[currentIndex]} />}
            </Splitter.Panel>
        </Splitter >
    </Flex>
}
