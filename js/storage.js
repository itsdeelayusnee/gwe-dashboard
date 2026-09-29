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

  async function addPerson(person) {
    const uid = await currentUserId();
    if (!uid) throw new Error("Not signed in");

    const payload = {
      user_id: uid,
      name: person.name.trim(),
      phone: person.phone?.trim() || null,
      source: person.source || null,
      status: "new_enquiry",
      date_added: new Date().toISOString().slice(0,10),
      notes: person.notes?.trim() || null
    };

    const { data: rows, error } = await client
      .from("gwe_people")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await addActivity(rows.id, "enquiry_added", "Enquiry added");
    await loadAll();
    return rows;
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
    // Remove child records first, then the person.
    const { error: followupError } = await supabase
      .from("gwe_followups")
      .delete()
      .eq("person_id", personId);

    if (followupError) throw followupError;

    const { error: activityError } = await supabase
      .from("gwe_activities")
      .delete()
      .eq("person_id", personId);

    if (activityError) throw activityError;

    const { error: personError } = await supabase
      .from("gwe_people")
      .delete()
      .eq("id", personId);

    if (personError) throw personError;

    await loadAll();
    return true;
  }

  return {
    client,
    getSession,
    signIn,
    signOut,
    loadAll,
    getData,
    addPerson,
    updatePerson,
    addFollowup,
    completeFollowups,
    snoozeFollowup,
    addActivity
  };
})();
