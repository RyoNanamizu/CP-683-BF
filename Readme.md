1. ## Structure
   - Backend (api):
     - Fastify (web framework)
     - TS
     - Postgres client
   - Frontend (web):
     - React
     - Vite
     - antd
2. ## Preset
   1. Modify and complete the contents of ".env.example" as ".env". (This file is primarily used to configure database connections.)
   2. Prepare the necessary HTTPS certificates in advance. (For information on obtaining an SSL certificate, please refer to Chapter 4.) Ensure the HTTPS certificates exist before docker compose up!
3. ## startup
   - Command:   
  `docker compose up --build`
   - Test:
     - Enter the following address in Terminal: 
       - `curl -k https://localhost/api/healthz`
       - `curl -k https://localhost/api/readyz`
       - `curl -k https://localhost/api/hello`
     - Enter http://localhost in browser -> Display the “Call API” button
   - tips: If build fails with "ERR_PNPM_OUTDATED_LOCKFILE", run `pnpm install` locally to update pnpm-lock.yaml, then rebuild docker.
1. ## HTTPS Certificates (Ubuntu 22)
   1. Install mkcert 
   ```(terminal)
   sudo apt update
   sudo apt install libnss3-tools -y

   wget https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64
   chmod +x mkcert-v1.4.4-linux-amd64
   sudo mv mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
   ```
   Test:  
    `mkcert -version`

   2. Install Local CA (Install the local root certificate in the system)
   ```
   (terminal)
   mkcert -install
   ```
   3. Generate HTTPS certificate  
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
 