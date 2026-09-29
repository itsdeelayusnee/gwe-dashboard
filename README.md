# Gold with Elleanor — V1

Mission: Help 1,000 people start saving in gold.

## Included
- Mission dashboard
- People / enquiry tracking
- Person journey profile
- 7-day registration follow-up
- 7-day first purchase follow-up
- Gold Saver Community
- Mission counter
- Local browser storage
- Basic PWA shell
- Supabase SQL schema for later connection

## Current storage
V1 works immediately using localStorage, so you can test the full flow without Supabase.

## Flow
1. Add enquiry
2. Mark education completed
   - registration follow-up is created for +7 days
3. Mark registered
   - registration follow-up completes
   - first purchase follow-up is created for +7 days
4. Mark started saving
   - pending follow-ups complete
   - person appears in Community
   - Mission counter increases by 1

## Supabase
When ready:
1. Create a Supabase project.
2. Run `supabase-schema.sql` in SQL Editor.
3. Put your project URL and anon key into `js/config.js`.
4. Replace the localStorage adapter with Supabase queries.

## Local preview
Use any local static server. For example:

python3 -m http.server 8000

Then open:
http://localhost:8000

PWA/service workers require HTTPS in production (localhost is allowed for testing).


## Existing savers
Use the + button → **Add Existing Saver**. Existing savers are added directly to Community, skip all follow-ups, and count toward the 1,000-person mission.


## Dashboard redesign
The interface has been restyled to match the visual family of the doitsaving.bn Hybrid Finance dashboard: branded header, cream dashboard background, large rounded panels, mission snapshot, monthly metrics and fixed bottom navigation.


## Supabase project connected
This build now contains the project's Supabase URL and publishable browser key in `js/config.js`.

The current data adapter still uses local browser storage until authentication is added. Because the GWE tables use Row Level Security tied to `auth.uid()`, the next step is to add the private email/password login and then replace the localStorage adapter with Supabase reads/writes.
