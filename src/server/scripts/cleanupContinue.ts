// src/server/scripts/cleanupContinue.ts
import Database from "better-sqlite3";


const DB_PATH = "/home/j/.opencorp/opencode-data/opencode/opencode.db";

function cleanupDuplicateContinuations() {
  const db = new Database(DB_PATH);
  try {
    const parts = db.prepare(`SELECT id, message_id, session_id FROM part WHERE data LIKE '%Continue a execução%'`).all() as any[];
    const msgIds = [...new Set(parts.map((p) => p.message_id).filter(Boolean))];

    if (parts.length > 0 || msgIds.length > 0) {
      const deletePart = db.prepare(`DELETE FROM part WHERE data LIKE '%Continue a execução%'`);
      const deleteMsg = db.prepare(`DELETE FROM message WHERE id = ?`);

      const tx = db.transaction(() => {
        deletePart.run();
        for (const mid of msgIds) {
          deleteMsg.run(mid);
        }
      });
      tx();
      console.log(`Removed ${parts.length} continuation parts and ${msgIds.length} messages.`);
    } else {
      console.log("No continuation prompts found.");
    }
  } finally {
    db.close();
  }
}

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && __filename === process.argv[1]) {
  cleanupDuplicateContinuations();
}
