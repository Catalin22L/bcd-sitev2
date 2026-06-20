document.addEventListener("DOMContentLoaded", () => {
  // Elemente UI
  const loginView = document.getElementById("admin-login-view");
  const dashboardView = document.getElementById("admin-dashboard-view");
  
  const loginForm = document.getElementById("login-form");
  const passwordInput = document.getElementById("admin-password");
  const loginError = document.getElementById("login-error-msg");
  
  const logoutBtn = document.getElementById("logout-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const searchInput = document.getElementById("search-input");
  const tableBody = document.getElementById("table-body");
  const noResultsMsg = document.getElementById("no-results-msg");
  
  const statTotal = document.getElementById("stat-total");
  const statToday = document.getElementById("stat-today");
  const facultiesContainer = document.getElementById("faculties-chart-container");
  const yearsContainer = document.getElementById("years-chart-container");

  // Date locale
  let allRegistrations = [];

  // Verificare inițială sesiune
  const savedPassword = sessionStorage.getItem("adminPassword");
  if (savedPassword) {
    verifyAndLoad(savedPassword);
  }

  // === Autentificare ===

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    
    loginError.style.display = "none";
    loginError.textContent = "";

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Autentificare eșuată.");
      }

      sessionStorage.setItem("adminPassword", password);
      showDashboard();
      loadDashboardData(password);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = "block";
    }
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("adminPassword");
    showLogin();
  });

  function showLogin() {
    loginView.style.display = "flex";
    dashboardView.style.display = "none";
    passwordInput.value = "";
  }

  function showDashboard() {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
  }

  async function verifyAndLoad(password) {
    try {
      // Testăm apelul API pentru a vedea dacă parola din sesiune mai e valabilă
      const response = await fetch("/api/admin/registrations", {
        headers: { "x-admin-password": password }
      });
      if (response.ok) {
        showDashboard();
        loadDashboardData(password);
      } else {
        sessionStorage.removeItem("adminPassword");
        showLogin();
      }
    } catch (err) {
      console.error(err);
      showLogin();
    }
  }

  // === Încărcare date ===

  async function loadDashboardData(password) {
    const pwd = password || sessionStorage.getItem("adminPassword");
    if (!pwd) return;

    try {
      // 1. Încărcare înscrieri
      const regResponse = await fetch("/api/admin/registrations", {
        headers: { "x-admin-password": pwd }
      });
      if (!regResponse.ok) throw new Error("Nu s-au putut încărca înscrierile.");
      allRegistrations = await regResponse.json();

      // 2. Încărcare statistici
      const statsResponse = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": pwd }
      });
      if (!statsResponse.ok) throw new Error("Nu s-au putut încărca statisticile.");
      const stats = await statsResponse.json();

      renderKPIs(allRegistrations, stats.total);
      renderCharts(stats);
      renderTable(allRegistrations);
    } catch (err) {
      console.error(err);
      alert("Eroare la încărcarea datelor dashboard: " + err.message);
    }
  }

  // === Randare interfață ===

  function renderKPIs(registrations, total) {
    statTotal.textContent = total;

    // Calculăm înscrierile de azi
    const today = new Date().toDateString();
    const todayCount = registrations.filter(r => {
      const regDate = new Date(r.timestamp).toDateString();
      return regDate === today;
    }).length;

    statToday.textContent = todayCount;
  }

  function renderCharts(stats) {
    // 1. Randare grafic facultăți
    if (stats.facultati && stats.facultati.length > 0) {
      facultiesContainer.innerHTML = "";
      const totalFac = stats.total;
      
      stats.facultati.forEach(f => {
        const percentage = totalFac > 0 ? Math.round((f.count / totalFac) * 100) : 0;
        const barHtml = `
          <div class="bar-wrapper">
            <div class="bar-info">
              <span class="bar-label">${f.facultate}</span>
              <span class="bar-value">${f.count} (${percentage}%)</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${percentage}%"></div>
            </div>
          </div>
        `;
        facultiesContainer.insertAdjacentHTML("beforeend", barHtml);
      });
    } else {
      facultiesContainer.innerHTML = '<p class="no-data">Nicio înscriere înregistrată încă.</p>';
    }

    // 2. Randare grafic ani studiu
    if (stats.ani && stats.ani.length > 0) {
      yearsContainer.innerHTML = "";
      const totalAni = stats.total;

      // Sortare ani de studiu logic (I, II, III, IV, Master)
      const order = { "Anul I": 1, "Anul II": 2, "Anul III": 3, "Anul IV": 4, "Master I": 5, "Master II": 6 };
      stats.ani.sort((a, b) => (order[a.an_studiu] || 99) - (order[b.an_studiu] || 99));

      stats.ani.forEach(a => {
        const percentage = totalAni > 0 ? Math.round((a.count / totalAni) * 100) : 0;
        const barHtml = `
          <div class="bar-wrapper">
            <div class="bar-info">
              <span class="bar-label">${a.an_studiu}</span>
              <span class="bar-value">${a.count} (${percentage}%)</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${percentage}%"></div>
            </div>
          </div>
        `;
        yearsContainer.insertAdjacentHTML("beforeend", barHtml);
      });
    } else {
      yearsContainer.innerHTML = '<p class="no-data">Nicio înscriere înregistrată încă.</p>';
    }
  }

  function renderTable(registrations) {
    tableBody.innerHTML = "";

    if (registrations.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="loading-td">Nu există participanți înscriși.</td></tr>';
      noResultsMsg.style.display = "none";
      return;
    }

    registrations.forEach(r => {
      const dateFormatted = new Date(r.timestamp).toLocaleString("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      const rowHtml = `
        <tr id="row-${r.id}">
          <td style="font-weight: 600;">${escapeHTML(r.nume)}</td>
          <td><a href="mailto:${escapeHTML(r.email)}" style="text-decoration: underline; color: #6eb2ff;">${escapeHTML(r.email)}</a></td>
          <td>${escapeHTML(r.telefon)}</td>
          <td>${escapeHTML(r.facultate)}</td>
          <td>${escapeHTML(r.an_studiu)}</td>
          <td>${escapeHTML(r.specializare)}</td>
          <td>${dateFormatted}</td>
          <td>
            <button class="btn-delete" data-id="${r.id}">Șterge</button>
          </td>
        </tr>
      `;
      tableBody.insertAdjacentHTML("beforeend", rowHtml);
    });

    // Atașare event listeners pentru butoanele de ștergere
    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.target.getAttribute("data-id");
        deleteRegistration(id);
      });
    });

    noResultsMsg.style.display = "none";
  }

  // === Ștergere Înregistrare ===

  async function deleteRegistration(id) {
    const pwd = sessionStorage.getItem("adminPassword");
    if (!pwd) return;

    if (!confirm("Sunteți sigur că doriți să ștergeți această înscriere? Această acțiune este ireversibilă.")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/registrations/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": pwd }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ștergerea a eșuat.");
      }

      // Reîncărcăm datele pentru a actualiza tabelele și graficele
      loadDashboardData(pwd);
    } catch (err) {
      alert("Eroare: " + err.message);
    }
  }

  // === Căutare / Filtrare ===

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      renderTable(allRegistrations);
      return;
    }

    const filtered = allRegistrations.filter(r => 
      r.nume.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query) ||
      r.telefon.toLowerCase().includes(query) ||
      r.facultate.toLowerCase().includes(query) ||
      r.an_studiu.toLowerCase().includes(query) ||
      r.specializare.toLowerCase().includes(query)
    );

    renderTable(filtered);
    
    if (filtered.length === 0) {
      noResultsMsg.style.display = "block";
    } else {
      noResultsMsg.style.display = "none";
    }
  });

  // === Export CSV ===

  exportCsvBtn.addEventListener("click", () => {
    if (allRegistrations.length === 0) {
      alert("Nu există date de exportat.");
      return;
    }

    const headers = ["ID", "Nume", "Email", "Telefon", "Facultate", "An Studiu", "Specializare", "Data Inscrierii"];
    const csvRows = [headers.join(",")];

    allRegistrations.forEach(r => {
      const dateFormatted = new Date(r.timestamp).toLocaleString("ro-RO");
      const values = [
        r.id,
        `"${r.nume.replace(/"/g, '""')}"`,
        `"${r.email.replace(/"/g, '""')}"`,
        `"${r.telefon.replace(/"/g, '""')}"`,
        `"${r.facultate.replace(/"/g, '""')}"`,
        `"${r.an_studiu.replace(/"/g, '""')}"`,
        `"${r.specializare.replace(/"/g, '""')}"`,
        `"${dateFormatted}"`
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n"); // Adăugare BOM pentru suport diacritice românești în Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inscrieri_bcd_2026_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Utilitar securitate XSS
  function escapeHTML(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
