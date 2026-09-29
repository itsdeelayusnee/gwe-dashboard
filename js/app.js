const App = (() => {
  const cfg = window.APP_CONFIG;
  let activePeopleFilter = "all";
  let activeFollowupFilter = "due";
  let activeCommunityFilter = "all";
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
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(new Date(`${dateStr}T12:00:00`));
  }


  function monthsSince(dateStr) {
    if (!dateStr) return null;
    const then = new Date(`${dateStr}T12:00:00`);
    const now = new Date();
    return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  }

  function statusLabel(status) {
    return {
      new_enquiry: "New enquiry",
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


  function monthKeyFromDate(value) {
    return value ? String(value).slice(0, 7) : "";
  }

  function monthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric"
    });
  }

  function lastMonthKeys(count = 12) {
    const out = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }

  function ensureSnapshotMonthOptions() {
    const select = $("#snapshotMonth");
    if (!select || select.options.length) return;

    const keys = lastMonthKeys(12).slice().reverse();
    select.innerHTML = keys.map(key =>
      `<option value="${key}">${escapeHtml(monthLabel(key))}</option>`
    ).join("");

    select.value = new Date().toISOString().slice(0, 7);
  }

  function renderMonthlySnapshot() {
    const { people, activities } = Storage.getData();
    ensureSnapshotMonthOptions();

    const selectedMonth = $("#snapshotMonth")?.value || new Date().toISOString().slice(0, 7);

    const countActivity = type => activities.filter(a =>
      a.activity_type === type &&
      monthKeyFromDate(a.activity_date) === selectedMonth
    ).length;

    const countPeopleDate = field => people.filter(p =>
      monthKeyFromDate(p[field]) === selectedMonth
    ).length;

    $("#statNew").textContent = countActivity("new_enquiry");
    $("#statEducation").textContent = countPeopleDate("registration_date");

    const newSavers2026 = people.filter(p =>
      monthKeyFromDate(p.registration_date).startsWith("2026-") &&
      monthKeyFromDate(p.last_purchase_date).startsWith("2026-")
    ).length;

    $("#statRegistered").textContent = newSavers2026;
    $("#statSaving").textContent = countPeopleDate("last_purchase_date");

    const months = Array.from({ length: 12 }, (_, i) => {
      const key = `2026-${String(i + 1).padStart(2, "0")}`;
      const registered = people.filter(p => monthKeyFromDate(p.registration_date) === key).length;
      const lastPurchase = people.filter(p => monthKeyFromDate(p.last_purchase_date) === key).length;
      const startedSaving = activities.filter(a =>
        a.activity_type === "started_saving" &&
        monthKeyFromDate(a.activity_date) === key
      ).length;

      return {
        key,
        label: new Date(2026, i, 1).toLocaleDateString(undefined, { month: "short" }),
        registered,
        lastPurchase,
        startedSaving
      };
    });

    const max = Math.max(
      1,
      ...months.flatMap(x => [x.registered, x.lastPurchase, x.startedSaving])
    );

    const chart = $("#missionMonthlyChart");
    chart.innerHTML = months.map(item => {
      const h = value => value === 0 ? 2 : Math.max(8, Math.round((value / max) * 100));

      return `<div class="month-bar-item history-month" title="${escapeHtml(monthLabel(item.key))}">
        <div class="history-values">
          <span>${item.registered || ""}</span>
          <span>${item.lastPurchase || ""}</span>
          <span>${item.startedSaving || ""}</span>
        </div>
        <div class="history-bars">
          <div class="history-bar-track" title="Registered: ${item.registered}">
            <div class="history-bar-fill history-registered" style="height:${h(item.registered)}%"></div>
          </div>
          <div class="history-bar-track" title="Last purchase: ${item.lastPurchase}">
            <div class="history-bar-fill history-purchase" style="height:${h(item.lastPurchase)}%"></div>
          </div>
          <div class="history-bar-track" title="Started saving: ${item.startedSaving}">
            <div class="history-bar-fill history-started" style="height:${h(item.startedSaving)}%"></div>
          </div>
        </div>
        <div class="month-bar-label">${escapeHtml(item.label)}</div>
      </div>`;
    }).join("");
  }

  function renderDashboard() {
    const { people, followups, activities } = Storage.getData();
    const started = people.filter(p => p.status === "started_saving").length;
    const pct = Math.min(100, (started / cfg.MISSION_TARGET) * 100);

    $("#missionCount").textContent = started;
    $("#communityCount").textContent = started;
    $("#missionProgress").style.width = `${pct}%`;
    $("#missionPercent").textContent = `${pct.toFixed(1)}% completed`;

    renderMonthlySnapshot();

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
    }).join("") : empty("No recent activity yet.");
  }

  function renderPeople() {
    const { people } = Storage.getData();
    const term = $("#peopleSearch")?.value?.trim().toLowerCase() || "";

    const rows = people.filter(p => {
      const matchesFilter = activePeopleFilter === "all" || p.status === activePeopleFilter;
      const matchesSearch = !term ||
        p.name.toLowerCase().includes(term) ||
        (p.source || "").toLowerCase().includes(term) ||
        (p.pg_code || "").toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });

    $("#peopleList").innerHTML = rows.length ? rows.map(p => {
      const cleanPhone = (p.phone || "").replace(/[^\d+]/g, "").replace("+", "");
      const meta = p.pg_code || p.source || "Gold Saver";

      return `<article class="person-card compact-person-card">
        <div class="compact-card-main">
          <div>
            <div class="person-name">${escapeHtml(p.name)}</div>
            <div class="person-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="status-pill">${escapeHtml(statusLabel(p.status))}</span>
        </div>

        <div class="compact-card-actions">
          ${cleanPhone ? `<button class="whatsapp-btn" data-phone="${escapeHtml(cleanPhone)}">WhatsApp</button>` : ""}
          <button class="delete-person-btn" data-id="${p.id}" data-name="${escapeHtml(p.name)}">Delete</button>
        </div>
      </article>`;
    }).join("") : empty("No people found.");

    $$("#peopleList .whatsapp-btn").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();
        window.open(`https://wa.me/${btn.dataset.phone}`, "_blank");
      })
    );

    $$("#peopleList .delete-person-btn").forEach(btn =>
      btn.addEventListener("click", async e => {
        e.stopPropagation();

        const personName = btn.dataset.name || "this person";
        const confirmed = window.confirm(`Delete ${personName}? This will also remove their follow-ups and activity history.`);

        if (!confirmed) return;

        try {
          await Storage.deletePerson(btn.dataset.id);
          toast("Person deleted");
          renderAll();
        } catch (err) {
          toast(err.message || "Could not delete person");
        }
      })
    );
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
        const cleanPhone = (p?.phone || "").replace(/[^\d+]/g, "").replace("+", "");
        const label = type === "registration" ? "Registration" : "First purchase";

        return `<article class="followup-card compact-followup-card">
          <div class="compact-card-main">
            <div>
              <div class="person-name">${escapeHtml(p?.name || "Unknown")}</div>
              <div class="person-meta">${label} • ${formatDate(f.due_date)}</div>
            </div>
            <span class="status-pill">${escapeHtml(f.status)}</span>
          </div>

          <div class="compact-card-actions">
            ${cleanPhone ? `<button class="whatsapp-btn" data-phone="${escapeHtml(cleanPhone)}">WhatsApp</button>` : ""}
            ${f.status === "pending" ? `<button class="secondary-btn mini-snooze" data-id="${f.id}">+7 days</button>` : ""}
          </div>
        </article>`;
      }).join("") : empty("Nothing here.");
    }

    renderType("registration", "#registrationFollowups");
    renderType("first_purchase", "#purchaseFollowups");

    $$(".whatsapp-btn").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      window.open(`https://wa.me/${btn.dataset.phone}`, "_blank");
    }));

    $$(".mini-snooze").forEach(btn => btn.addEventListener("click", async e => {
      e.stopPropagation();
      try {
        await Storage.snoozeFollowup(btn.dataset.id, 7);
        toast("Follow up moved by 7 days");
        renderAll();
      } catch (err) {
        toast(err.message || "Could not snooze follow up");
      }
    }));
  }

  function renderCommunity() {
    const { people } = Storage.getData();
    const term = $("#communitySearch")?.value?.trim().toLowerCase() || "";

    const rows = people
      .filter(p => p.status === "started_saving")
      .filter(p => {
        const matchesSearch = !term ||
          p.name.toLowerCase().includes(term) ||
          (p.pg_code || "").toLowerCase().includes(term) ||
          (p.source || "").toLowerCase().includes(term);

        if (!matchesSearch) return false;

        const months = monthsSince(p.last_purchase_date);

        if (activeCommunityFilter === "all") return true;
        if (activeCommunityFilter === "recent") return months !== null && months < 3;
        if (activeCommunityFilter === "3to6") return months !== null && months >= 3 && months < 6;
        if (activeCommunityFilter === "6to12") return months !== null && months >= 6 && months < 12;
        if (activeCommunityFilter === "12plus") return months !== null && months >= 12;
        if (activeCommunityFilter === "none") return !p.last_purchase_date;

        return true;
      });

    $("#communityList").innerHTML = rows.length ? rows.map(p => {
      const cleanPhone = (p.phone || "").replace(/[^\d+]/g, "").replace("+", "");
      const meta = p.pg_code || p.source || "Gold Saver";

      let lastPurchaseText = "No recent purchase recorded";
      if (p.last_purchase_date) {
        lastPurchaseText = `Last purchase ${formatDate(p.last_purchase_date)}`;
      } else if (p.last_purchase_note) {
        lastPurchaseText = p.last_purchase_note;
      }

      return `<article class="person-card compact-person-card servicing-card">
        <div class="compact-card-main">
          <div>
            <div class="person-name">${escapeHtml(p.name)}</div>
            <div class="person-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="status-pill">Saver</span>
        </div>

        <div class="servicing-meta">
          ${escapeHtml(lastPurchaseText)}
        </div>

        ${cleanPhone ? `
          <div class="compact-card-actions">
            <button class="whatsapp-btn" data-phone="${escapeHtml(cleanPhone)}">WhatsApp</button>
          </div>
        ` : ""}
      </article>`;
    }).join("") : empty("No savers found for this filter.");

    $$("#communityList .whatsapp-btn").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();
        window.open(`https://wa.me/${btn.dataset.phone}`, "_blank");
      })
    );
  }

  function renderAll() {
    renderDashboard();
    renderPeople();
    renderFollowups();
    renderCommunity();
  }

  function openProfile(id) {
    selectedPersonId = id;
    const { people } = Storage.getData();
    const p = people.find(x => x.id === id);
    if (!p) return;

    $("#profileName").textContent = p.name;
    $("#profileMeta").textContent =
      `${p.pg_code || p.source || "Gold Saver"} • Added ${formatDate(p.date_added)}`;
    $("#profileNotes").textContent = p.notes || "No notes yet.";

    const journey = [
      ["Enquiry", p.date_added, !!p.date_added],
      ["Education completed", p.education_date, !!p.education_date],
      ["Registered", p.registration_date, !!p.registration_date],
      ["Started saving", p.started_saving_date, !!p.started_saving_date || p.status === "started_saving"]
    ];

    $("#profileJourney").innerHTML = journey.map(([label,date,done]) => `
      <div class="journey-step ${done ? "done" : ""}">
        <div class="journey-dot">${done ? "✓" : "○"}</div>
        <div>
          <strong>${label}</strong>
          <small>${done ? (date ? formatDate(date) : "Completed") : "Pending"}</small>
        </div>
      </div>`).join("");

    $("#profileActions").innerHTML = actionButtons(p);
    bindProfileActions();
    $("#profileModal").classList.add("show");
  }

  function actionButtons(p) {
    let html = "";

    if (p.status === "new_enquiry") {
      html += `<button class="primary-btn" data-action="education">Mark education completed</button>`;
    } else if (p.status === "registration_pending") {
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
    $$("[data-action]").forEach(btn => btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const { people } = Storage.getData();
      const p = people.find(x => x.id === selectedPersonId);
      if (!p) return;

      try {
        if (action === "education") {
          const date = localDate();
          await Storage.updatePerson(p.id, {
            status: "registration_pending",
            education_date: date
          });
          await Storage.addFollowup(p.id, "registration", addDays(date, cfg.FOLLOWUP_DAYS));
          await Storage.addActivity(p.id, "education_completed", "7-day registration follow up created");
          toast("Education completed");
        }

        if (action === "registered") {
          const date = localDate();
          await Storage.completeFollowups(p.id, "registration");
          await Storage.updatePerson(p.id, {
            status: "purchase_pending",
            registration_date: date
          });
          await Storage.addFollowup(p.id, "first_purchase", addDays(date, cfg.FOLLOWUP_DAYS));
          await Storage.addActivity(p.id, "registered", "7-day first purchase follow up created");
          toast("Registered");
        }

        if (action === "started") {
          const date = localDate();
          await Storage.completeFollowups(p.id);
          await Storage.updatePerson(p.id, {
            status: "started_saving",
            started_saving_date: date
          });
          await Storage.addActivity(p.id, "started_saving", "Added to Gold Saver Community");
          toast("Mission +1 ✦");
        }

        if (action === "note") {
          const note = prompt("Update notes:", p.notes || "");
          if (note !== null) {
            await Storage.updatePerson(p.id, { notes: note });
            await Storage.addActivity(p.id, "note_added", "Notes updated");
            toast("Notes updated");
          }
        }

        if (action === "noresponse") {
          await Storage.updatePerson(p.id, { status: "no_response" });
          toast("Marked no response");
        }

        if (action === "whatsapp") {
          window.open(`https://wa.me/${btn.dataset.phone.replace("+","")}`, "_blank");
          return;
        }

        renderAll();
        openProfile(p.id);
      } catch (err) {
        console.error(err);
        toast(err.message || "Something went wrong");
      }
    }));
  }

  async function handleAuth() {
    const session = await Storage.getSession();

    if (session) {
      $("#loginScreen").classList.add("hidden");
      await Storage.loadAll();
      renderAll();
    } else {
      $("#loginScreen").classList.remove("hidden");
    }

    $("#loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      $("#loginError").textContent = "";

      try {
        await Storage.signIn(
          $("#loginEmail").value.trim(),
          $("#loginPassword").value
        );
        await Storage.loadAll();
        $("#loginScreen").classList.add("hidden");
        renderAll();
      } catch (err) {
        $("#loginError").textContent = err.message || "Could not sign in.";
      }
    });

    $("#signOutBtn")?.addEventListener("click", async () => {
      await Storage.signOut();
      $("#loginScreen").classList.remove("hidden");
    });
  }

  function bindUI() {
    $$(".nav-item").forEach(btn => btn.addEventListener("click", () => {
      $$(".nav-item").forEach(x => x.classList.remove("active"));
      $$(".page").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.page}`).classList.add("active");
    }));

    $("#openAddPerson").addEventListener("click", () => {
      $("#addChoiceModal").classList.add("show");
    });

    $("#openAddPersonHero")?.addEventListener("click", () => $("#openAddPerson").click());

    $("#chooseNewEnquiry").addEventListener("click", () => {
      $("#addChoiceModal").classList.remove("show");
      $("#personModal").classList.add("show");
    });

    $("#chooseExistingSaver").addEventListener("click", () => {
      $("#addChoiceModal").classList.remove("show");
      const dateInput = $("#existingSaverForm input[name='started_saving_date']");
      if (dateInput && !dateInput.value) dateInput.value = localDate();
      $("#existingSaverModal").classList.add("show");
    });

    $$("[data-close-choice]").forEach(el => el.addEventListener("click", () => $("#addChoiceModal").classList.remove("show")));
    $$("[data-close-modal]").forEach(el => el.addEventListener("click", () => $("#personModal").classList.remove("show")));
    $$("[data-close-existing]").forEach(el => el.addEventListener("click", () => $("#existingSaverModal").classList.remove("show")));
    $$("[data-close-profile]").forEach(el => el.addEventListener("click", () => $("#profileModal").classList.remove("show")));

    $("#personForm").addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);

      try {
        const record = await Storage.addPerson({
          name: fd.get("name"),
          phone: fd.get("phone"),
          source: fd.get("source"),
          notes: fd.get("notes")
        });
        await Storage.addActivity(record.id, "new_enquiry", "New enquiry added");
        e.currentTarget.reset();
        $("#personModal").classList.remove("show");
        toast("Enquiry added");
        renderAll();
      } catch (err) {
        toast(err.message || "Could not add enquiry");
      }
    });

    $("#existingSaverForm").addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);

      try {
        const record = await Storage.addPerson({
          name: fd.get("name"),
          phone: fd.get("phone"),
          source: fd.get("source") || "Existing Frontline",
          notes: fd.get("notes")
        });

        await Storage.updatePerson(record.id, {
          status: "started_saving",
          started_saving_date: fd.get("started_saving_date") || localDate()
        });

        await Storage.addActivity(
          record.id,
          "started_saving",
          "Existing saver added to Gold Saver Community",
          fd.get("started_saving_date") || localDate()
        );

        e.currentTarget.reset();
        $("#existingSaverModal").classList.remove("show");
        toast("Existing saver added • Mission +1");
        renderAll();
      } catch (err) {
        toast(err.message || "Could not add existing saver");
      }
    });

    $("#peopleSearch").addEventListener("input", renderPeople);
    $("#communitySearch").addEventListener("input", renderCommunity);
    $("#snapshotMonth")?.addEventListener("change", renderMonthlySnapshot);

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


    $$("#communityFilters .filter-chip").forEach(btn => btn.addEventListener("click", () => {
      $$("#communityFilters .filter-chip").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      activeCommunityFilter = btn.dataset.filter;
      renderCommunity();
    }));
  }

  async function init() {
    bindUI();
    await handleAuth();

    Storage.client.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await Storage.loadAll();
        $("#loginScreen").classList.add("hidden");
        renderAll();
      } else {
        $("#loginScreen").classList.remove("hidden");
      }
    });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
