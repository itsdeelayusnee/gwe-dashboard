# Delete and duplicate-entry fix

Upload the contents of this folder to the existing GWE Dashboard project and redeploy in Vercel. Keep your existing Supabase settings. JavaScript asset versions have been updated so the browser fetches the fix.

Delete now calls the correct database client and exposed method, checks the selected person's ID and account ownership, removes their dependent records, verifies exactly one person was deleted, and updates the dashboard. Database permission errors are shown. The confirmation dialog remains; existing duplicate records are not automatically removed.

Save buttons are disabled while saving. New entries are checked against fresh database records using name + phone (ignoring case, spacing, and phone punctuation). Different names may share the same phone, including junior accounts. If a record saves but history refresh fails, the message says it was saved so you do not retry. Existing savers now save their status and first-purchase date in the initial insert.

For protection against simultaneous saves from separate tabs/devices, run duplicate-protection.sql once in Supabase SQL Editor. It preserves existing records and rejects future duplicate identities. The app's duplicate check works without this SQL, but only the database guard covers concurrent sessions.

If deletion reports a permission error, inspect the DELETE policies for gwe_people, gwe_followups, and gwe_activities for the signed-in owner (user_id = auth.uid()). This package does not broaden database access.

Validated locally with mocked database tests for deletion, blocked deletion, duplicate detection, simultaneous Save, shared family phone numbers, and successful save followed by history failure. The live Vercel deployment and database have not been changed or tested.

## Monthly progress correction
The selected month's New Savers card and chart now share one calculation based on started_saving_date, with the earliest dated started_saving activity used only when the date is absent. Registration dates and latest purchase dates are not first-purchase dates. Repeat purchases do not add another new saver. The waiting card is scoped to registrations in the selected month, matching its chart segment. Enquiry activities count each existing person once per month. Savers without a first-purchase date or dated start activity stay in the overall mission total; a visible note explains their exclusion from monthly totals. Enter their actual first-purchase dates rather than guessing from latest purchases.

## Activity and lead-source correction
Both legacy enquiry_added and new_enquiry activities now use the enquiry label and count in monthly progress and lead sources. Lead-source fallback applies per person, rather than disappearing when any other enquiry has an activity. Recent Activity sorts events newest first, hides orphan records, and collapses the two enquiry aliases when logged for the same person on the same day. New enquiry saves use the existing enquiry_added activity type. No database migration is required for this correction.
