import { Alert, Button, Collapse, Flex, Input, type CollapseProps } from "antd"
import { MessagePackList } from "./Message";
import { useState } from "react";


const SignMessage = () => {

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
            <Button color="primary" variant="solid">Generate A New Message Pack</Button>
            <Button color="danger" variant="solid">Clear</Button>
        </Flex>
    </Flex >
}



const Items: CollapseProps['items'] = [
    {
        key: 1,
        label: "Sign a new Message",
        children: <SignMessage />,
    },
    {
        key: 2,
        label: "Show Message Pack List",
        children: <MessagePackList />,
    }
]

type Props = {
    // You can add props here if needed
    username: string
}

export const SignPanel = (_props: Props) => {
    return <Collapse items={Items} defaultActiveKey={[1]} />
}

