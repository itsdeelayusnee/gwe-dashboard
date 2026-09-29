const App = (() => {
  const cfg = window.APP_CONFIG;
  let activePeopleFilter = "all";
  let activeFollowupFilter = "due";
  let selectedPersonId = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function localDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(`${dateStr}T12:00:00`));
  }

  function statusLabel(status) {
    return {
      new_enquiry: "New enquiry",
      education_completed: "Education completed",
      registration_pending: "Registration pending",
      purchase_pending: "Purchase pending",
      started_saving: "Started saving",
      no_response: "No response",
      not_interested: "Not interested"
    }[status] || status;
  }

  function activityLabel(type, personName) {
    const map = {
      enquiry_added: `${personName} enquiry received`,
      education_completed: `${personName} education completed`,
      registered: `${personName} registered`,
      started_saving: `${personName} started saving gold`,
      followup_completed: `${personName} follow up completed`,
      note_added: `${personName} note updated`
    };
    return map[type] || `${personName} updated`;
  }

  function daysAgoLabel(iso) {
    const then = new Date(iso);
    const now = new Date();
    const diff = Math.max(0, Math.floor((now - then) / 86400000));
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return `${diff} days ago`;
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  function renderDashboard() {
    const { people, followups, activities } = Storage.getData();
    const started = people.filter(p => p.status === "started_saving").length;
    const pct = Math.min(100, (started / cfg.MISSION_TARGET) * 100);

    $("#missionCount").textContent = started;
    $("#communityCount").textContent = started;
    $("#missionProgress").style.width = `${pct}%`;
    $("#missionPercent").textContent = `${pct.toFixed(1)}% completed`;

    const monthKey = new Date().toISOString().slice(0, 7);
    $("#statNew").textContent = people.filter(p => p.date_added?.startsWith(monthKey)).length;
    $("#statEducation").textContent = people.filter(p => p.education_date?.startsWith(monthKey)).length;
    $("#statSaving").textContent = people.filter(p => p.started_saving_date?.startsWith(monthKey)).length;

    const today = localDate();
    $("#statFollowups").textContent = followups.filter(f => f.status === "pending" && f.due_date <= today).length;

    const recent = activities.slice(0, 6);
    $("#recentActivity").innerHTML = recent.length ? recent.map(a => {
      const person = people.find(p => p.id === a.person_id);
      return `<div class="activity-card">
        <div>
          <strong>${escapeHtml(activityLabel(a.activity_type, person?.name || "Someone"))}</strong>
          <small>${escapeHtml(a.details || "")}</small>
        </div>
        <small>${daysAgoLabel(a.activity_date)}</small>
      </div>`;
    }).join("") : empty("No activity yet. Add your first enquiry.");
  }

  function renderPeople() {
    const { people } = Storage.getData();
    const term = $("#peopleSearch")?.value?.trim().toLowerCase() || "";
    let rows = people.filter(p => {
      const matchesFilter = activePeopleFilter === "all" || p.status === activePeopleFilter;
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || (p.source || "").toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });

    $("#peopleList").innerHTML = rows.length ? rows.map(personCard).join("") : empty("No people found.");
    $$(".person-card").forEach(card => card.addEventListener("click", () => openProfile(card.dataset.id)));
  }

  function personCard(p) {
    const { followups } = Storage.getData();
    const next = followups
      .filter(f => f.person_id === p.id && f.status === "pending")
      .sort((a,b) => a.due_date.localeCompare(b.due_date))[0];

    return `<article class="person-card" data-id="${p.id}">
      <div class="person-top">
        <div>
          <div class="person-name">${escapeHtml(p.name)}</div>
          <div class="person-meta">${escapeHtml(p.source || "Unknown source")}</div>
        </div>
        <span class="status-pill">${escapeHtml(statusLabel(p.status))}</span>
      </div>
      <div class="card-footer">
        <span>Added ${formatDate(p.date_added)}</span>
        <span>${next ? `Follow up ${formatDate(next.due_date)}` : "No follow up"}</span>
      </div>
    </article>`;
  }

  function renderFollowups() {
    const { followups, people } = Storage.getData();
    const today = localDate();

    function include(f) {
      if (activeFollowupFilter === "due") return f.status === "pending" && f.due_date <= today;
      if (activeFollowupFilter === "upcoming") return f.status === "pending" && f.due_date > today;
      return f.status === "completed";
    }

    function renderType(type, target) {
      const rows = followups
        .filter(f => f.followup_type === type && include(f))
        .sort((a,b) => a.due_date.localeCompare(b.due_date));

      $(target).innerHTML = rows.length ? rows.map(f => {
        const p = people.find(x => x.id === f.person_id);
        return `<article class="followup-card">
          <div class="person-top">
            <div>
              <div class="person-name">${escapeHtml(p?.name || "Unknown")}</div>
              <div class="person-meta">${type === "registration" ? "Registration follow up" : "First purchase follow up"}</div>
            </div>
            <span class="status-pill">${formatDate(f.due_date)}</span>
          </div>
          <div class="card-footer">
            <button class="secondary-btn mini-open" data-person="${p?.id || ""}">Open</button>
            ${f.status === "pending" ? `<button class="secondary-btn mini-snooze" data-id="${f.id}">+7 days</button>` : ""}
          </div>
        </article>`;
      }).join("") : empty("Nothing here.");
    }

    renderType("registration", "#registrationFollowups");
    renderType("first_purchase", "#purchaseFollowups");

    $$(".mini-open").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      if (btn.dataset.person) openProfile(btn.dataset.person);
    }));
    $$(".mini-snooze").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      Storage.snoozeFollowup(btn.dataset.id, 7);
      toast("Follow up moved by 7 days");
      renderAll();
    }));
  }

  function renderCommunity() {
    const { people } = Storage.getData();
    const term = $("#communitySearch")?.value?.trim().toLowerCase() || "";
    const rows = people.filter(p => p.status === "started_saving")
      .filter(p => !term || p.name.toLowerCase().includes(term) || (p.source || "").toLowerCase().includes(term));

    $("#communityList").innerHTML = rows.length ? rows.map(p => `
      <article class="person-card" data-id="${p.id}">
        <div class="person-top">
          <div>
            <div class="person-name">${escapeHtml(p.name)}</div>
            <div class="person-meta">${escapeHtml(p.source || "")}</div>
          </div>
          <span class="status-pill">Started saving</span>
        </div>
        <div class="card-footer">
          <span>Started ${formatDate(p.started_saving_date)}</span>
          <span>Mission +1 ✦</span>
        </div>
      </article>`).join("") : empty("No one has been marked as started saving yet.");

    $$("#communityList .person-card").forEach(card => card.addEventListener("click", () => openProfile(card.dataset.id)));
  }

  function openProfile(id) {
    selectedPersonId = id;
    const { people } = Storage.getData();
    const p = people.find(x => x.id === id);
    if (!p) return;

    $("#profileName").textContent = p.name;
    $("#profileMeta").textContent = `${p.source || "Unknown source"} • Added ${formatDate(p.date_added)}`;
    $("#profileNotes").textContent = p.notes || "No notes yet.";

    const journey = [
      ["Enquiry", p.date_added, true],
      ["Education completed", p.education_date, !!p.education_date],
      ["Registered", p.registration_date, !!p.registration_date],
      ["Started saving", p.started_saving_date, !!p.started_saving_date]
    ];

    $("#profileJourney").innerHTML = journey.map(([label,date,done]) => `
      <div class="journey-step ${done ? "done" : ""}">
        <div class="journey-dot">${done ? "✓" : "○"}</div>
        <div>
          <strong>${label}</strong>
          <small>${done ? formatDate(date) : "Pending"}</small>
        </div>
      </div>`).join("");

    $("#profileActions").innerHTML = actionButtons(p);
    bindProfileActions();

    $("#profileModal").classList.add("show");
    $("#profileModal").setAttribute("aria-hidden","false");
  }

  function actionButtons(p) {
    let html = "";
    if (p.status === "new_enquiry") {
      html += `<button class="primary-btn" data-action="education">Mark education completed</button>`;
    } else if (p.status === "registration_pending" || p.status === "education_completed") {
      html += `<button class="primary-btn" data-action="registered">Mark registered</button>`;
    } else if (p.status === "purchase_pending") {
      html += `<button class="primary-btn" data-action="started">Mark started saving</button>`;
    }

    if (p.phone) {
      const clean = p.phone.replace(/[^\d+]/g,"");
      html += `<button class="secondary-btn" data-action="whatsapp" data-phone="${escapeHtml(clean)}">Open WhatsApp</button>`;
    }
    html += `<button class="secondary-btn" data-action="note">Edit notes</button>`;
    if (p.status !== "started_saving") {
      html += `<button class="secondary-btn" data-action="noresponse">Mark no response</button>`;
    }
    return html;
  }

  function bindProfileActions() {
    $$("[data-action]").forEach(btn => btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const { people } = Storage.getData();
      const p = people.find(x => x.id === selectedPersonId);
      if (!p) return;

      if (action === "education") {
        const date = localDate();
        Storage.updatePerson(p.id, { status: "registration_pending", education_date: date });
        Storage.addFollowup(p.id, "registration", addDays(date, cfg.FOLLOWUP_DAYS));
        Storage.addActivity(p.id, "education_completed", "7-day registration follow up created");
        toast("Education completed");
      }

      if (action === "registered") {
        const date = localDate();
        Storage.completeFollowups(p.id, "registration");
        Storage.updatePerson(p.id, { status: "purchase_pending", registration_date: date });
        Storage.addFollowup(p.id, "first_purchase", addDays(date, cfg.FOLLOWUP_DAYS));
        Storage.addActivity(p.id, "registered", "7-day first purchase follow up created");
        toast("Registered");
      }

      if (action === "started") {
        const date = localDate();
        Storage.completeFollowups(p.id);
        Storage.updatePerson(p.id, { status: "started_saving", started_saving_date: date });
        Storage.addActivity(p.id, "started_saving", "Added to Gold Saver Community");
        toast("Mission +1 ✦");
      }

      if (action === "note") {
        const note = prompt("Update notes:", p.notes || "");
        if (note !== null) {
          Storage.updatePerson(p.id, { notes: note });
          Storage.addActivity(p.id, "note_added", "Notes updated");
          toast("Notes updated");
        }
      }

      if (action === "noresponse") {
        Storage.updatePerson(p.id, { status: "no_response" });
        toast("Marked no response");
      }

      if (action === "whatsapp") {
        window.open(`https://wa.me/${btn.dataset.phone.replace("+","")}`, "_blank");
        return;
      }

      renderAll();
      openProfile(p.id);
    }));
  }

  function empty(text) {
    return `<div class="empty-card">${escapeHtml(text)}</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderAll() {
    renderDashboard();
    renderPeople();
    renderFollowups();
    renderCommunity();
  }

  function bindUI() {
    $$(".nav-item").forEach(btn => btn.addEventListener("click", () => {
      $$(".nav-item").forEach(x => x.classList.remove("active"));
      $$(".page").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.page}`).classList.add("active");
      $("#pageTitle").textContent = btn.dataset.title;
    }));

    $("#openAddPerson").addEventListener("click", () => {
      $("#personModal").classList.add("show");
      $("#personModal").setAttribute("aria-hidden","false");
    });

    $$("[data-close-modal]").forEach(el => el.addEventListener("click", () => $("#personModal").classList.remove("show")));
    $$("[data-close-profile]").forEach(el => el.addEventListener("click", () => $("#profileModal").classList.remove("show")));

    $("#personForm").addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      Storage.addPerson({
        name: fd.get("name"),
        phone: fd.get("phone"),
        source: fd.get("source"),
        notes: fd.get("notes")
      });
      e.currentTarget.reset();
      $("#personModal").classList.remove("show");
      toast("Enquiry added");
      renderAll();
    });

    $("#peopleSearch").addEventListener("input", renderPeople);
    $("#communitySearch").addEventListener("input", renderCommunity);

    $$("#peopleFilters .filter-chip").forEach(btn => btn.addEventListener("click", () => {
      $$("#peopleFilters .filter-chip").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      activePeopleFilter = btn.dataset.filter;
      renderPeople();
    }));

    $$("#followupFilters .filter-chip").forEach(btn => btn.addEventListener("click", () => {
      $$("#followupFilters .filter-chip").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      activeFollowupFilter = btn.dataset.filter;
      renderFollowups();
    }));
  }

  function init() {
    bindUI();
    renderAll();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
