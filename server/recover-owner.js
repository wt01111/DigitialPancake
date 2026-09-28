import { db, one, run } from "./db.js";
import { recoverOwnerAccount } from "./owner-recovery.js";

try {
  const result = await recoverOwnerAccount(
    {
      email: process.env.RECOVERY_OWNER_EMAIL || process.env.OWNER_EMAIL,
      nickname: process.env.OWNER_NICKNAME,
    },
    { db, one, run },
  );
  console.log("Owner account recovered; existing sessions were revoked.");
  console.log(`Login email: ${result.email}`);
  console.log(`New password (shown once): ${result.password}`);
} finally {
  db.close();
}
