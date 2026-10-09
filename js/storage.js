const Storage = (() => {
  const cfg = window.APP_CONFIG;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let data = {
    people: [],
    followups: [],
    activities: []
  };

  async function getSession() {
    const { data: sessionData, error } = await client.auth.getSession();
    if (error) throw error;
    return sessionData.session;
  }

  async function signIn(email, password) {
    const { data: authData, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return authData;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function currentUserId() {
    const session = await getSession();
    return session?.user?.id || null;
  }

  async function loadAll() {
    const uid = await currentUserId();
    if (!uid) {
      data = { people: [], followups: [], activities: [] };
      return data;
    }

    const [peopleRes, followupsRes, activitiesRes] = await Promise.all([
      client.from("gwe_people").select("*").order("created_at", { ascending: false }),
      client.from("gwe_followups").select("*").order("due_date", { ascending: true }),
      client.from("gwe_activities").select("*").order("activity_date", { ascending: false })
    ]);

    if (peopleRes.error) throw peopleRes.error;
    if (followupsRes.error) throw followupsRes.error;
    if (activitiesRes.error) throw activitiesRes.error;

    data = {
      people: peopleRes.data || [],
      followups: followupsRes.data || [],
      activities: activitiesRes.data || []
    };
    return data;
  }

  function getData() {
    return data;
  }

  let addingPerson = false;
  const deletingPeople = new Set();
  const normalizeName = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const normalizePhone = value => String(value || "").replace(/\D/g, "").replace(/^00/, "");

  async function addPerson(person) {
    if (addingPerson) throw new Error("A person is already being saved. Please wait.");
    addingPerson = true;
    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not signed in");
      const name = String(person.name || "").trim().replace(/\s+/g, " ");
      if (!name) throw new Error("Please enter a name.");
      const phone = normalizePhone(person.phone);
      // Check fresh records, rather than a possibly stale rendered list.
      const { data: existing, error: lookupError } = await client
        .from("gwe_people").select("id,name,phone").eq("user_id", uid);
      if (lookupError) throw lookupError;
      const duplicate = (existing || []).find(p =>
        normalizeName(p.name) === normalizeName(name) && normalizePhone(p.phone) === phone
      );
      if (duplicate) throw new Error("This person already exists. Open their existing record to update it.");
      const payload = {
        user_id: uid,
        name,
        phone: phone || null,
        source: person.source || null,
        status: person.status === "started_saving" ? "started_saving" : "new_enquiry",
        date_added: new Date().toISOString().slice(0,10),
        ...(person.status === "started_saving" ? { started_saving_date: person.started_saving_date } : {}),
        notes: person.notes?.trim() || null
      };
      const { data: row, error } = await client.from("gwe_people")
        .insert(payload).select().single();
      if (error) {
        if (error.code === "23505") throw new Error("This person already exists. Open their existing record to update it.");
        throw error;
      }
      // The person is now saved. A secondary failure must not invite another insert.
      data.people = [row, ...data.people.filter(p => p.id !== row.id)];
      let warning = "";
      try {
        await addActivity(row.id,
          row.status === "started_saving" ? "started_saving" : "new_enquiry",
          row.status === "started_saving" ? "Existing saver added to Gold Saver Community" : "New enquiry added",
          row.status === "started_saving" ? row.started_saving_date : null);
      } catch (err) {
        warning = "Person saved, but history could not refresh. Refresh the dashboard; do not add them again.";
      }
      return { ...row, saveWarning: warning };
    } finally {
      addingPerson = false;
    }
  }

  async function updatePerson(personId, patch) {
    const { data: row, error } = await client
      .from("gwe_people")
      .update(patch)
      .eq("id", personId)
      .select()
      .single();

    if (error) throw error;
    await loadAll();
    return row;
  }

  async function addFollowup(personId, type, dueDate, notes = "") {
    const uid = await currentUserId();
    if (!uid) throw new Error("Not signed in");

    const existing = data.followups.find(f =>
      f.person_id === personId &&
      f.followup_type === type &&
      f.status === "pending"
    );
    if (existing) return existing;

    const { data: row, error } = await client
      .from("gwe_followups")
      .insert({
        user_id: uid,
        person_id: personId,
        followup_type: type,
        due_date: dueDate,
        status: "pending",
        notes: notes || null
      })
      .select()
      .single();

    if (error) throw error;
    await loadAll();
    return row;
  }

  async function completeFollowups(personId, type = null) {
    let query = client
      .from("gwe_followups")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("person_id", personId)
      .eq("status", "pending");

    if (type) query = query.eq("followup_type", type);

    const { error } = await query;
    if (error) throw error;
    await loadAll();
  }

  async function snoozeFollowup(followupId, days) {
    const d = new Date();
    d.setDate(d.getDate() + days);

    const { error } = await client
      .from("gwe_followups")
      .update({
        due_date: d.toISOString().slice(0,10),
        status: "pending"
      })
      .eq("id", followupId);

    if (error) throw error;
    await loadAll();
  }

  async function addActivity(personId, type, details = "", activityDate = null) {
    const uid = await currentUserId();
    if (!uid) throw new Error("Not signed in");

    const { error } = await client
      .from("gwe_activities")
      .insert({
        user_id: uid,
        person_id: personId,
        activity_type: type,
        details: details || null,
        ...(activityDate ? { activity_date: activityDate } : {})
      });

    if (error) throw error;
    await loadAll();
  }


  async function deletePerson(personId) {
    if (!personId) throw new Error("Missing person ID. Refresh and try again.");
    if (deletingPeople.has(personId)) throw new Error("Deletion is already in progress.");
    deletingPeople.add(personId);
    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not signed in");
      // Verify ownership before touching dependent records.
      const { data: person, error: lookupError } = await client.from("gwe_people")
        .select("id").eq("id", personId).eq("user_id", uid).maybeSingle();
      if (lookupError) throw lookupError;
      if (!person) throw new Error("Person not found or deletion is not permitted. Refresh the dashboard.");
      for (const table of ["gwe_followups", "gwe_activities"]) {
        const { error } = await client.from(table).delete()
          .eq("person_id", personId).eq("user_id", uid);
        if (error) throw error;
      }
      const { data: removed, error } = await client.from("gwe_people")
        .delete().eq("id", personId).eq("user_id", uid).select("id");
      if (error) throw error;
      if (!removed || removed.length !== 1) {
        throw new Error("Deletion was not confirmed. Check database delete permissions and refresh.");
      }
      data.people = data.people.filter(p => p.id !== personId);
      data.followups = data.followups.filter(f => f.person_id !== personId);
      data.activities = data.activities.filter(a => a.person_id !== personId);
      try { await loadAll(); } catch (err) {
        return { warning: "Person deleted. Refresh to reload the remaining records." };
      }
      return { warning: "" };
    } finally {
      deletingPeople.delete(personId);
    }
  }

  return {
    client,
    getSession,
    signIn,
    signOut,
    loadAll,
    getData,
    addPerson,
    deletePerson,
    updatePerson,
    addFollowup,
    completeFollowups,
    snoozeFollowup,
    addActivity
  };
})();
