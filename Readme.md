1. ## Structure
   - Backend (api):
     - Fastify (web framework)
     - TS
     - Postgres client
   - Frontend (web):
     - React
     - Vite
     - antd
2. ## startup
   - Preset: Modify and complete the contents of “.env.example”. (This file is primarily used to configure database connections.)
   - Command: 
      >docker compose up --build
   - Test: Enter the following address in browser and observe the results.
     - http://localhost:3000/healthz -> *ok: true*
     - http://localhost:3000/readyz -> *ok: true /n bd: "up"*
     - http://localhost:3000/hello -> *msg: "hello world" /n now: "(the current time)"*
     - http://localhost:5173 -> Display the “Call API” button
 