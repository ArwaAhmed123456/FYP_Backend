# MongoDB collections used for conversing with patients

In **MongoDB Atlas**, the following collections are used for patient support and chat:

## 1. **SupportRequests**

- **Model:** `SupportRequestModel.js` → collection name: `SupportRequests`
- **Purpose:** One document per ticket. Patient (or doctor) creates a ticket by selecting issue type, writing details, and submitting. No email is sent to the patient.
- **Key fields:** `patientId`, `doctorId`, `userType`, `subject`, `message`, `status` (open | in-progress | resolved), `issueType`, `contactEmail`, `adminResponse`, `createdAt`, `updatedAt`.

## 2. **SupportMessages**

- **Model:** `SupportMessageModel.js` → collection name: `SupportMessages`
- **Purpose:** Chat thread per ticket. Each message in a conversation is stored here.
- **Key fields:** `supportRequestId` (ref to SupportRequests), `senderType` (patient | admin), `senderId`, `text`, `readAt`, `createdAt`, `updatedAt`.

## Flow

1. Patient creates a ticket (Help Center → select issue, write details, create ticket) → one **SupportRequests** document and the first **SupportMessages** document (patient’s initial message).
2. Admin sees the ticket in Doc Patient Panel and opens the chat → reads/writes **SupportMessages** for that `supportRequestId`.
3. Patient sees the chat in Messages → Support Chat (SadaPay-style UI) and can reply → more **SupportMessages** are added.

No email is sent to the patient; all communication happens in the in-app chat UI.
