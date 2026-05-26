-- Calendar stickers: drag-drop "Tentative" / "Confirmed" / "Cancelled"
-- onto an event or task to mark its confirmation state. Independent of
-- the `status` column (which tracks task workflow). Nullable — most
-- entries carry no sticker.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "confirmation" varchar(20);
