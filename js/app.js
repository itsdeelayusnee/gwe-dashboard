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
      new_enquiry: `${personName} enquiry received`,
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


  function isEnquiryActivity(activity) {
    return ["enquiry_added", "new_enquiry"].includes(activity.activity_type);
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

  function fy2026MonthKeys() {
    return [
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"
    ];
  }

  function isInFY2026(dateValue) {
    const key = monthKeyFromDate(dateValue);
    return key >= "2026-04" && key <= "2027-03";
  }

  function ensureSnapshotMonthOptions() {
    const select = $("#snapshotMonth");
    if (!select || select.options.length) return;

    const keys = fy2026MonthKeys();
    select.innerHTML = keys.map(key =>
      `<option value="${key}">${escapeHtml(monthLabel(key))}</option>`
    ).join("");

    const currentKey = new Date().toISOString().slice(0, 7);
    select.value = keys.includes(currentKey) ? currentKey : keys[0];
  }

  function renderMonthlySnapshot() {
    const { people, activities } = Storage.getData();
    ensureSnapshotMonthOptions();

    const selectedMonth = $("#snapshotMonth")?.value || "2026-04";

    // A saver belongs to their first-saving month, never registration or
    // latest-purchase month. Older records may have a dated start activity.
    const startMonths = new Map(people.map(person => {
      const startActivities = activities.filter(a =>
        a.person_id === person.id && a.activity_type === "started_saving" && a.activity_date
      ).map(a => String(a.activity_date)).sort();
      return [person.id, monthKeyFromDate(person.started_saving_date || startActivities[0])];
    }));

    const months = fy2026MonthKeys().map(key => {
      const enquiryIds = new Set(activities.filter(a =>
        isEnquiryActivity(a) && monthKeyFromDate(a.activity_date) === key
      ).map(a => a.person_id).filter(Boolean));
      const newEnquiries = people.filter(p => enquiryIds.has(p.id)).length;
      const waiting = people.filter(p =>
        monthKeyFromDate(p.registration_date) === key && p.status === "purchase_pending"
      ).length;
      const newSavers = people.filter(p => startMonths.get(p.id) === key).length;
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short" }),
        newEnquiries, waiting, newSavers
      };
    });
    // Cards and chart use exactly the same monthly values.
    const selected = months.find(m => m.key === selectedMonth);
    $("#statNew").textContent = selected?.newEnquiries || 0;
    $("#statWaiting").textContent = selected?.waiting || 0;
    $("#statRegistered").textContent = selected?.newSavers || 0;
    const missingDates = people.filter(p =>
      p.status === "started_saving" && !startMonths.get(p.id)
    ).length;
    const dateNote = $("#monthlyDateNote");
    if (dateNote) {
      dateNote.textContent = missingDates
        ? `${missingDates} saver${missingDates === 1 ? " has" : "s have"} no first-purchase date and cannot be assigned to a month.`
        : "New Savers are counted by first-purchase date.";
    }

    const maxTotal = Math.max(
      1,
      ...months.map(x => x.newEnquiries + x.waiting + x.newSavers)
    );

    const chart = $("#missionMonthlyChart");
    chart.innerHTML = months.map(item => {
      const total = item.newEnquiries + item.waiting + item.newSavers;
      const h = total === 0 ? 2 : Math.max(10, Math.round((total / maxTotal) * 100));

      const enquiriesPct = total ? (item.newEnquiries / total) * 100 : 0;
      const waitingPct = total ? (item.waiting / total) * 100 : 0;
      const saversPct = total ? (item.newSavers / total) * 100 : 0;

      return `<div class="stack-month-item" title="${escapeHtml(monthLabel(item.key))}">
        <div class="stack-total">${total || ""}</div>
        <div class="stack-bar-shell" style="height:${h}%">
          ${item.newSavers ? `<div class="stack-segment stack-saver" style="height:${saversPct}%" title="New Savers: ${item.newSavers}"></div>` : ""}
          ${item.waiting ? `<div class="stack-segment stack-waiting" style="height:${waitingPct}%" title="Waiting to Start: ${item.waiting}"></div>` : ""}
          ${item.newEnquiries ? `<div class="stack-segment stack-enquiry" style="height:${enquiriesPct}%" title="New Enquiries: ${item.newEnquiries}"></div>` : ""}
        </div>
        <div class="stack-label">${escapeHtml(item.label)}</div>
      </div>`;
    }).join("");
  }


  function normalizeLeadSource(value) {
    const raw = (value || "").trim().toLowerCase();

    if (["tiktok", "tik tok"].includes(raw)) return "TikTok";
    if (["instagram", "ig", "insta"].includes(raw)) return "Instagram";
    if (["threads", "thread"].includes(raw)) return "Threads";
    if (["referral", "refer", "referred", "friend", "family"].includes(raw)) return "Referral";
    if (["whatsapp", "wa"].includes(raw)) return "WhatsApp";
    return raw ? "Other" : "Other";
  }

  function renderLeadSources() {
    const { people, activities } = Storage.getData();
    const fyStart = "2026-04";
    const fyEnd = "2027-03";

    // Lead sources are based on genuine new-enquiry activity in the FY.
    // Prefer activity-backed enquiries; fall back to people records marked new_enquiry.
    const activityPersonIds = new Set(
      activities
        .filter(a =>
          isEnquiryActivity(a) &&
          monthKeyFromDate(a.activity_date) >= fyStart &&
          monthKeyFromDate(a.activity_date) <= fyEnd
        )
        .map(a => a.person_id)
        .filter(Boolean)
    );

    const leadPeople = people.filter(p => activityPersonIds.has(p.id) || (
      p.status === "new_enquiry" &&
      monthKeyFromDate(p.date_added) >= fyStart &&
      monthKeyFromDate(p.date_added) <= fyEnd
    ));

    const orderedSources = ["TikTok", "Instagram", "Threads", "Referral", "WhatsApp", "Other"];
    const counts = Object.fromEntries(orderedSources.map(s => [s, 0]));

    leadPeople.forEach(p => {
      const source = normalizeLeadSource(p.source);
      counts[source] = (counts[source] || 0) + 1;
    });

    const total = leadPeople.length;
    $("#leadSourceTotal").textContent = total;

    const donut = $("#leadSourceDonut");
    const legend = $("#leadSourceLegend");
    if (!donut || !legend) return;

    const active = orderedSources
      .map((source, i) => ({ source, count: counts[source], i }))
      .filter(x => x.count > 0);

    if (!active.length) {
      donut.style.background = "conic-gradient(var(--line) 0 100%)";
      legend.innerHTML = `<div class="lead-source-empty">No FY enquiries recorded yet.</div>`;
      return;
    }

    let cursor = 0;
    const colorVars = [
      "var(--lead-1)",
      "var(--lead-2)",
      "var(--lead-3)",
      "var(--lead-4)",
      "var(--lead-5)",
      "var(--lead-6)"
    ];

    const segments = active.map(item => {
      const start = cursor;
      const pct = (item.count / total) * 100;
      cursor += pct;
      return `${colorVars[item.i]} ${start}% ${cursor}%`;
    });

    donut.style.background = `conic-gradient(${segments.join(", ")})`;

    legend.innerHTML = active.map(item => {
      const pct = Math.round((item.count / total) * 100);
      return `<div class="lead-source-row">
        <div class="lead-source-label">
          <i class="lead-source-dot" style="background:${colorVars[item.i]}"></i>
          <span>${escapeHtml(item.source)}</span>
        </div>
        <div class="lead-source-value">
          <strong>${item.count}</strong>
          <span>${pct}%</span>
        </div>
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

    const seenEnquiries = new Set();
    const recent = [...activities]
      .filter(a => people.some(p => p.id === a.person_id))
      .sort((a, b) => String(b.activity_date || "").localeCompare(String(a.activity_date || "")))
      .filter(a => {
        if (!isEnquiryActivity(a)) return true;
        // Older builds sometimes logged both aliases for the same enquiry.
        const key = `${a.person_id}:${String(a.activity_date || "").slice(0, 10)}`;
        if (seenEnquiries.has(key)) return false;
        seenEnquiries.add(key);
        return true;
      }).slice(0, 6);
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

        if (!confirmed || btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "Deleting…";

        try {
          const result = await Storage.deletePerson(btn.dataset.id);
          toast(result.warning || "Person deleted");
          renderAll();
        } catch (err) {
          toast(err.message || "Could not delete person");
        } finally {
          btn.disabled = false;
          btn.textContent = "Delete";
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
    renderLeadSources();
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
          await Storage.addActivity(p.id, "started_saving", "Added to Gold Saver Community", date);
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
      const form = e.currentTarget;
      if (form.dataset.saving === "true") return;
      form.dataset.saving = "true";
      const saveButton = form.querySelector("button[type=submit]");
      if (saveButton) saveButton.disabled = true;
      const fd = new FormData(form);

      try {
        const record = await Storage.addPerson({
          name: fd.get("name"),
          phone: fd.get("phone"),
          source: fd.get("source"),
          notes: fd.get("notes")
        });
        form.reset();
        $("#personModal").classList.remove("show");
        toast(record.saveWarning || "Enquiry added");
        renderAll();
      } catch (err) {
        toast(err.message || "Could not add enquiry");
      } finally {
        form.dataset.saving = "false";
        if (saveButton) saveButton.disabled = false;
      }
    });

    $("#existingSaverForm").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      if (form.dataset.saving === "true") return;
      form.dataset.saving = "true";
      const saveButton = form.querySelector("button[type=submit]");
      if (saveButton) saveButton.disabled = true;
      const fd = new FormData(form);

      try {
        const record = await Storage.addPerson({
          name: fd.get("name"),
          phone: fd.get("phone"),
          source: fd.get("source") || "Existing Frontline",
          status: "started_saving",
          started_saving_date: fd.get("started_saving_date") || localDate(),
          notes: fd.get("notes")
        });

        form.reset();
        $("#existingSaverModal").classList.remove("show");
        toast(record.saveWarning || "Existing saver added • Mission +1");
        renderAll();
      } catch (err) {
        toast(err.message || "Could not add existing saver");
      } finally {
        form.dataset.saving = "false";
        if (saveButton) saveButton.disabled = false;
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
