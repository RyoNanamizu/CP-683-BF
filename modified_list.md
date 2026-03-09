1. **SQL**:
   1. Remove `messages` table since there is already exist a message_pack table.
   2. create new table `validation_requests`:  
        `validation_requests`  
        |  
        |-- id  
        |-- message_pack_id -> message_packs.id  
        |-- requester: requester's handle  
        |-- responder: responder's handle  
        |-- status: Pending / Replied / Passed / Failed / Refused / Error  
        |-- response_payload: responder’s evidence payload (e.g., base64 ringSig2 or agreed blob), nullable  
        |-- created_at / updated_at: 
        
        - INDEX (requester, created_at DESC)
        - INDEX (responder, created_at DESC)

2. **API**:  
   > The current user determined by session.
   1. POST /validation-requests  
   Initiate a verification request and verify the initiator's identity. 
   2. GET /validation-requests/sent  
   Return all requests belonging to the requester (in reverse chronological order).
   3. GET /validation-requests/received  
   Return all requests belonging to the responder.
   4. PUT /validation-requests/:id/respond  
   Responser's response or rejection.
   5. PUT /validation-requests/:id/result  
   Requester writes back the verification result: "Passed" & "Failed" & "Error".
3. Modified `server.ts`, add routing for the verification step
4. Create `apps/api/src/interfaces/ValidationRequestInterfaces.ts` to define request/response types: Create、List、Respond、Refuse、ResultUpdate...
5. Create `apps/api/src/services/ValidationRequestServices.ts`