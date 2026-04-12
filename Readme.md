## Idea

This system utilizes a Yubikey and WebAuthn to register a public key in the browser, followed by a WebAuthn challenge. A one-time private key is generated locally using the results of the Yubikey challenge, which is then used to derive a corresponding one-time public key (OPK). Simultaneously, seven "fake" public keys are generated. These, along with the OPK, are used to generate a Ring Signature 2 based on the content to be signed.

The OPK is hashed and used as a salt to request a passphrase via the Yubikey PRF (Pseudo-Random Function). This passphrase is processed into an AES-GCM key, which is used to encrypt Ring Signature 2 to produce a proof. Appended to this proof are the AES-GCM authentication tag and the hash of Ring Signature 2. Concurrently, another seven fake public keys are generated; these, together with the OPK, the content to be signed, and the hash of Ring Signature 2, are used to generate a primary Ring Signature.
Verification and Revelation

Upon receiving the content, signature, and proof, the recipient constructs the verification data by concatenating the content with the plaintext Ring Signature 2 hash found in the proof. This allows them to verify that the signature is valid without revealing the sender's identity.

In the future, the sender can request the signature and proof from the recipient. The sender then uses the original Yubikey to perform a PRF on the eight public keys in the signature and attempts to decrypt the proof with each resulting key. The sender’s original one-time public key should successfully decrypt the proof. The sender then provides Ring Signature 2 to the recipient. The recipient will observe that Ring Signature 2 overlaps with the original public key ring, shares the same linkable tag, contains the same content, and matches the plaintext hash in the proof. If Ring Signature 2 remains valid, the recipient confirms the sender's identity.

The reason seven randomly generated keys are used instead of the original keys is that the one-time signature itself is generated quasi-randomly (based on the challenge result).
Engineering Implementation

Building on this logic, we are considering an engineered system consisting of a web interface and a backend server. This system allows anyone to log in via Yubikey, create messages, and send them anonymously. Alternatively, upon receiving a message, a recipient can request identity verification from a purported sender.

    The system allows users to find others via their WebAuthn login public key or a manually configured username.

    The system is used solely for message transmission and proof verification; it does not mandate system-level verification.

    Since a WebAuthn public key cannot derive the one-time key, it serves only as an identifier.

Key Characteristics

A one-time key corresponds to exactly one message; any re-signed message triggers the generation of a new key. Consequently, the system does not maintain a public key infrastructure (PKI). The public key itself does not prove identity, as it is unique to a single message. The sole proof of identity is the decryption process of the proof, which only the original sender can perform.

Note: Recommend to use Linux to run the source code

## Structure

- Backend (api):
  - Fastify (web framework)
  - TS
  - Postgres client
- Frontend (web):
  - React
  - Vite
  - antd

## Preset

1.  Modify and complete the contents of ".env.example" as ".env". (This file is primarily used to configure database connections.)
2.  Prepare the necessary HTTPS certificates in advance. (For information on obtaining an SSL certificate, please refer to Chapter 4.) Ensure the HTTPS certificates exist before docker compose up!

## Startup

- Command:  
  `docker compose up --build`
- Test:
  - Enter the following address in Terminal:
    - `curl -k https://localhost/api/healthz`
    - `curl -k https://localhost/api/readyz`
    - `curl -k https://localhost/api/hello`
  - Enter http://localhost in browser -> Display the “Call API” button
- tips: If build fails with "ERR_PNPM_OUTDATED_LOCKFILE", run `pnpm install` locally to update pnpm-lock.yaml, then rebuild docker.

## HTTPS Certificates (Ubuntu 22)

1.  Install mkcert

```(terminal)
sudo apt update
sudo apt install libnss3-tools -y

wget https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64
chmod +x mkcert-v1.4.4-linux-amd64
sudo mv mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
```

Test:  
 `mkcert -version`

2.  Install Local CA (Install the local root certificate in the system)

```
(terminal)
mkcert -install
```

3.  Generate HTTPS certificate  
    In the monorepo root directory

```
(terminal)
mkdir certs
cd certs

mkcert localhost 127.0.0.1 ::1

(Rename for easier subsequent reference.)
mv localhost+2.pem dev.crt
mv localhost+2-key.pem dev.key
```
