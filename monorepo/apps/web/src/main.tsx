import ReactDOM from "react-dom/client";
import { Button } from "antd";
import { hello } from "@repo/shared";
import "antd/dist/reset.css";

function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>{hello("monorepo")}</h1>
      <Button type="primary" onClick={() => fetch("/api/hello").then(r => r.json()).then(console.log)}>
        Call API
      </Button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);