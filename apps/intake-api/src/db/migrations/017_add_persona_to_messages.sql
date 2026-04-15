-- Persist the bot persona per message so it doesn't change retroactively
ALTER TABLE intake_messages
  ADD COLUMN IF NOT EXISTS persona VARCHAR(50);
