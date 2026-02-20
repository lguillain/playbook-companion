-- Link staged edits to the chat message that created them
-- so DiffCards survive page reloads.

alter table staged_edits
  add column message_id uuid references chat_messages on delete set null;

create index idx_staged_edits_message_id on staged_edits (message_id);
