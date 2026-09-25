import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable(
  "rooms",
  {
    code: text("code").primaryKey(),
    version: integer("version").notNull().default(0),
    data: text("data").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [index("rooms_updated").on(t.updated)],
);
export const presence = sqliteTable(
  "presence",
  {
    id: text("id").primaryKey(),
    room: text("room").notNull(),
    seen: integer("seen").notNull(),
    tab: text("tab").notNull(),
  },
  (t) => [index("presence_room").on(t.room)],
);
export const limits = sqliteTable(
  "limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("limits_expires").on(t.expires)],
);
