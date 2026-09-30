import Dexie from "dexie";

import {
  LUMINA_PERSONAL_DB_NAME,
  closeJournalDatabase,
} from "../../src/lib/journal/database";

export async function resetPersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}
