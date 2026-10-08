-- Reception can now send a member the link to their own page; the activity
-- log needs a name for it.
ALTER TYPE "ActivityAction" ADD VALUE 'SEND_PORTAL_LINK';
