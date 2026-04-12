const API_BASE_URL = "http://localhost:3000";

// Test data with 8 base64-encoded keys
const testData = {
  message: "Hello, Ring Signature!",
  ring_public_keys: [
    Buffer.from("key1").toString("base64"),
    Buffer.from("key2").toString("base64"),
    Buffer.from("key3").toString("base64"),
    Buffer.from("key4").toString("base64"),
    Buffer.from("key5").toString("base64"),
    Buffer.from("key6").toString("base64"),
    Buffer.from("key7").toString("base64"),
    Buffer.from("key8").toString("base64"),
  ],
  outer_signature: Buffer.from("test_signature").toString("base64"),
  encrypted_proof: Buffer.from("encrypted_data").toString("base64"),
};

async function testAPI() {
  console.log("Starting API Tests...\n");

  try {
    // Test 1: POST /message
    console.log("Test 1: POST /message");
    console.log("Request:", JSON.stringify(testData, null, 2));

    const postResponse = await fetch(`${API_BASE_URL}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    const postData = await postResponse.json();
    console.log(`Status: ${postResponse.status}`);
    console.log("Response:", JSON.stringify(postData, null, 2));

    if (!postResponse.ok) {
      console.log("POST request failed");
      return;
    }

    const messageId = postData.message_id;
    console.log(`Message created with ID: ${messageId}\n`);

    // Test 2: GET /message/{message_id}
    console.log("Test 2: GET /message/{message_id}");
    console.log(`Fetching message with ID: ${messageId}`);

    const getResponse = await fetch(`${API_BASE_URL}/message/${messageId}`);
    const getMessage = await getResponse.json();

    console.log(`Status: ${getResponse.status}`);
    console.log("Response:", JSON.stringify(getMessage, null, 2));

    if (!getResponse.ok) {
      console.log("GET request failed");
      return;
    }

    console.log("\nGET request successful");

    if (isMessageMatch && isSignatureMatch && isKeysMatch && isProofMatch) {
      console.log("\nAll tests passed!");
    } else {
      console.log("\nSome data mismatches detected");
    }

    // Test 3: GET non-existent message
    console.log("\nTest 3: GET /message/{invalid_id} (should return 404)");
    const invalidResponse = await fetch(
      `${API_BASE_URL}/message/00000000-0000-0000-0000-000000000000`,
    );
    console.log(`Status: ${invalidResponse.status}`);
    if (invalidResponse.status === 404) {
      console.log("Correctly returned 404 for non-existent message");
    } else {
      console.log("Expected 404 status");
    }
  } catch (error) {
    console.error("Error during testing:", error);
  }
}

// Run tests
testAPI();
