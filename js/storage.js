const Storage = (() => {
  const KEY = "gwe_v1_data";

  const seed = {
    people: [],
    followups: [],
    activities: []
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : structuredClone(seed);
    } catch {
      return structuredClone(seed);
    }
  }

  let data = load();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function id() {
    return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function addPerson(person) {
    const record = {
      id: id(),
      name: person.name.trim(),
      phone: person.phone?.trim() || "",
      source: person.source,
      status: "new_enquiry",
      date_added: new Date().toISOString().slice(0, 10),
      education_date: null,
      registration_date: null,
      started_saving_date: null,
      notes: person.notes?.trim() || "",
      created_at: new Date().toISOString()
    };
    data.people.unshift(record);
    addActivity(record.id, "enquiry_added", "Enquiry added");
    save();
    return record;
  }

  function updatePerson(personId, patch) {
    const person = data.people.find(p => p.id === personId);
    if (!person) return null;
    Object.assign(person, patch);
    save();
    return person;
  }

  function addFollowup(personId, type, dueDate, notes = "") {
    // Avoid duplicate pending follow-up of same type.
    const existing = data.followups.find(f =>
      f.person_id === personId &&
      f.followup_type === type &&
      f.status === "pending"
    );
    if (existing) return existing;

    const followup = {
      id: id(),
      person_id: personId,
      followup_type: type,
      due_date: dueDate,
      status: "pending",
      outcome: "",
      notes,
      completed_at: null,
      created_at: new Date().toISOString()
    };
    data.followups.push(followup);
    save();
    return followup;
  }

  function completeFollowups(personId, type = null) {
    const now = new Date().toISOString();
    data.followups.forEach(f => {
      if (f.person_id === personId && f.status === "pending" && (!type || f.followup_type === type)) {
        f.status = "completed";
        f.completed_at = now;
      }
    });
    save();
  }

  function snoozeFollowup(followupId, days) {
    const f = data.followups.find(x => x.id === followupId);
    if (!f) return;
    const d = new Date();
    d.setDate(d.getDate() + days);
    f.due_date = d.toISOString().slice(0, 10);
    f.status = "pending";
    save();
  }

  function addActivity(personId, type, details = "") {
    data.activities.unshift({
      id: id(),
      person_id: personId,
      activity_type: type,
      activity_date: new Date().toISOString(),
      details
    });
    save();
  }

  function getData() {
    return data;
  }

  function reset() {
    data = structuredClone(seed);
    save();
  }

  return {
    getData,
    addPerson,
    updatePerson,
    addFollowup,
    completeFollowups,
    snoozeFollowup,
    addActivity,
    reset
  };
})();
