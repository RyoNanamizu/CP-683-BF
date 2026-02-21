// import type { MessagePack } from "@repo/shared";
import { Splitter, Flex } from "antd";

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

export const MessagePackList = () => {
    return <Splitter>
        <Splitter.Panel min="20%">
            <Desc text="First" />
        </Splitter.Panel>
        <Splitter.Panel min="20%">
            <Desc text="Second" />
        </Splitter.Panel>
    </Splitter>
}
