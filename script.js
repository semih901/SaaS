const SUPABASE_CONFIG = {
  url: "https://uwpytmtkdejwzxepimjh.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cHl0bXRrZGVqd3p4ZXBpbWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzgwODEsImV4cCI6MjEwMTQxNDA4MX0.R48W94A-ut7OklGsxDoNxpqpvdfQA1zjjXiRt5qcM_w"
};

const ADMIN_EMAIL = "semihcifci100@gmail.com";

document.addEventListener("DOMContentLoaded", function () {
  var sbClient = null;
  if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
    try {
      sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    } catch (e) {
      sbClient = null;
    }
  }

  var currentUser = null;
  var cachedUsers = [];
  var systemLogs = [];
  var chartRendered = false;
  var metricsInterval = null;
  var autoSyncInterval = null;
  var realtimeChannel = null;

  function isAdmin(email) {
    if (!email) return false;
    return String(email).trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }

  function ts() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0") + ":" +
           String(d.getSeconds()).padStart(2, "0");
  }

  function addLog(msg) {
    systemLogs.push({ time: ts(), message: msg });
    if (systemLogs.length > 80) systemLogs.shift();
    renderLogs();
  }

  function renderLogs() {
    var area = document.getElementById("system-logs");
    if (!area) return;
    area.innerHTML = "";
    for (var i = systemLogs.length - 1; i >= 0; i--) {
      var el = document.createElement("div");
      el.className = "log-entry";
      el.innerHTML = '<span class="log-time">[' + systemLogs[i].time + ']</span><span class="log-action">' + systemLogs[i].message + '</span>';
      area.appendChild(el);
    }
  }

  function showAlert(containerId, message, type) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.className = "auth-alert " + type;
    el.innerText = message;
    el.style.display = "block";
  }

  function hideAlert(containerId) {
    var el = document.getElementById(containerId);
    if (el) {
      el.style.display = "none";
      el.innerText = "";
    }
  }

  function setMetricApi(ms) {
    var el = document.getElementById("metric-api");
    if (el) el.innerText = ms + " ms";
  }

  function applyRolePermissions() {
    var isUserAdmin = currentUser && isAdmin(currentUser.email);
    var usersTabBtn = document.querySelector('.sidebar-item[data-tab="tab-users"]');
    var dbTabBtn = document.querySelector('.sidebar-item[data-tab="tab-database"]');

    if (isUserAdmin) {
      if (usersTabBtn) usersTabBtn.style.display = "";
      if (dbTabBtn) dbTabBtn.style.display = "";
    } else {
      if (usersTabBtn) usersTabBtn.style.display = "none";
      if (dbTabBtn) dbTabBtn.style.display = "none";

      var activeTab = document.querySelector(".sidebar-item.active");
      var activeTabId = activeTab ? activeTab.getAttribute("data-tab") : null;
      if (activeTabId === "tab-users" || activeTabId === "tab-database") {
        var overviewBtn = document.querySelector('.sidebar-item[data-tab="tab-overview"]');
        if (overviewBtn) {
          overviewBtn.click();
        }
      }
    }
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var target = document.getElementById("view-" + name);
    if (target) target.classList.add("active");

    var landingNav = document.getElementById("landing-nav");
    if (name === "dashboard") {
      if (landingNav) landingNav.style.display = "none";
    } else {
      if (landingNav) landingNav.style.display = "";
    }

    if (name !== "landing") window.scrollTo(0, 0);
    updateNavState();

    if (name === "dashboard") {
      initDashboard();
    } else {
      if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
      }
      if (metricsInterval) {
        clearInterval(metricsInterval);
        metricsInterval = null;
      }
    }
  }

  function updateNavState() {
    var guest = document.getElementById("nav-guest");
    var authed = document.getElementById("nav-authed");
    var avLanding = document.getElementById("nav-av-landing");

    if (currentUser) {
      if (guest) guest.style.display = "none";
      if (authed) authed.style.display = "flex";
      var letter = (currentUser.username || currentUser.email || "U").trim().charAt(0).toUpperCase();
      if (avLanding) avLanding.innerText = letter;
    } else {
      if (guest) guest.style.display = "flex";
      if (authed) authed.style.display = "none";
    }
  }

  function updateDashHeader() {
    if (!currentUser) return;
    var navUsername = document.getElementById("nav-username");
    var navAvatar = document.getElementById("nav-avatar");
    var isUserAdmin = isAdmin(currentUser.email);
    var roleBadgeText = isUserAdmin ? " (Yönetici)" : " (Kullanıcı)";
    var displayName = (currentUser.username || currentUser.email || "Kullanıcı") + roleBadgeText;
    if (navUsername) navUsername.innerText = displayName;
    if (navAvatar) navAvatar.innerText = (currentUser.username || currentUser.email || "K").trim().charAt(0).toUpperCase();
  }

  document.querySelectorAll("[data-view]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var view = this.getAttribute("data-view");
      if (view === "dashboard" && !currentUser) {
        showView("login");
        return;
      }
      showView(view);
    });
  });

  document.querySelectorAll("[data-scroll]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var id = this.getAttribute("data-scroll");
      showView("landing");
      setTimeout(function () {
        var sec = document.getElementById(id);
        if (sec) sec.scrollIntoView({ behavior: "smooth" });
      }, 60);
    });
  });

  ["logo-home", "login-logo-home", "register-logo-home"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        showView("landing");
      });
    }
  });

  document.querySelectorAll(".toggle-password").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var wrapper = this.closest(".input-wrapper");
      var input = wrapper ? wrapper.querySelector("input") : null;
      var eyeIcon = this.querySelector(".icon-eye");
      var eyeOffIcon = this.querySelector(".icon-eye-off");

      if (input && input.type === "password") {
        input.type = "text";
        if (eyeIcon) eyeIcon.classList.add("hidden");
        if (eyeOffIcon) eyeOffIcon.classList.remove("hidden");
      } else if (input) {
        input.type = "password";
        if (eyeIcon) eyeIcon.classList.remove("hidden");
        if (eyeOffIcon) eyeOffIcon.classList.add("hidden");
      }
    });
  });

  async function cloudSignUp(username, email, password) {
    if (!sbClient) {
      throw new Error("Supabase yapılandırması eksik.");
    }
    var t0 = performance.now();
    var res = await sbClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { username: username }
      }
    });
    if (res.error) throw res.error;

    var userId = res.data.user ? res.data.user.id : null;
    var userRole = isAdmin(email) ? "admin" : "user";
    var userRecord = {
      username: username,
      email: email,
      role: userRole,
      created_at: new Date().toISOString()
    };
    if (userId) {
      userRecord.id = userId;
    }

    var insertRes = await sbClient.from("users").insert([userRecord]);
    if (insertRes.error) {
      var fallbackRecord = {
        username: username,
        email: email
      };
      await sbClient.from("users").insert([fallbackRecord]);
    }

    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));
    return res.data;
  }

  async function cloudSignIn(email, password) {
    if (!sbClient) {
      throw new Error("Supabase yapılandırması eksik.");
    }
    var t0 = performance.now();
    var res = await sbClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));
    if (res.error) throw res.error;
    return res.data;
  }

  async function cloudSignOut() {
    if (sbClient) {
      await sbClient.auth.signOut();
    }
    currentUser = null;
    cachedUsers = [];
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  }

  async function cloudFetchUsers() {
    if (!sbClient) return [];
    var t0 = performance.now();
    var res = await sbClient.from("users").select("*").order("created_at", { ascending: false });
    if (res.error) {
      res = await sbClient.from("users").select("*");
    }
    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));

    if (res.error) throw res.error;
    var data = res.data || [];
    cachedUsers = data;
    return data;
  }

  async function cloudDeleteUser(userId, email) {
    if (!sbClient) return;
    var t0 = performance.now();
    var res = null;
    if (userId) {
      res = await sbClient.from("users").delete().eq("id", userId);
    }
    if (!res || res.error) {
      res = await sbClient.from("users").delete().eq("email", email);
    }
    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));
    if (res && res.error) throw res.error;
  }

  async function cloudUpdateUser(newUsername, newPassword) {
    if (!sbClient || !currentUser) return;
    var t0 = performance.now();

    if (newPassword) {
      var authRes = await sbClient.auth.updateUser({
        password: newPassword,
        data: { username: newUsername }
      });
      if (authRes.error) throw authRes.error;
    }

    var dbRes = await sbClient.from("users").update({ username: newUsername }).eq("id", currentUser.id);
    if (dbRes.error) {
      await sbClient.from("users").update({ username: newUsername }).eq("email", currentUser.email);
    }

    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));
    currentUser.username = newUsername;
  }

  async function cloudResetDatabase() {
    if (!sbClient) return;
    var t0 = performance.now();
    await sbClient.from("users").delete().neq("email", "non_existing_system_null_placeholder@nexus.cloud");
    await cloudSignOut();
    var t1 = performance.now();
    setMetricApi(Math.max(6, Math.round(t1 - t0)));
  }

  var registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideAlert("register-alert");
      var btn = document.getElementById("register-submit-btn");
      var uname = registerForm.querySelector("input[name='username']").value.trim();
      var email = registerForm.querySelector("input[name='email']").value.trim();
      var pass = registerForm.querySelector("input[name='password']").value.trim();

      if (!uname || !email || !pass) {
        showAlert("register-alert", "Lütfen tüm alanları doldurun.", "error");
        return;
      }
      if (pass.length < 6) {
        showAlert("register-alert", "Şifreniz en az 6 karakter olmalıdır.", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Buluta Kaydediliyor...";
      }

      try {
        await cloudSignUp(uname, email, pass);
        addLog("Yeni kullanıcı bulut sunucusuna kaydoldu ve users tablosuna yazıldı (" + email + ")");
        showAlert("register-alert", "Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz...", "success");
        registerForm.reset();
        setTimeout(function () {
          hideAlert("register-alert");
          showView("login");
          var loginEmail = document.getElementById("login-email");
          if (loginEmail) loginEmail.value = email;
        }, 1200);
      } catch (err) {
        showAlert("register-alert", err.message || "Kayıt başarısız oldu.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Kayıt Ol";
        }
      }
    });
  }

  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideAlert("login-alert");
      var btn = document.getElementById("login-submit-btn");
      var email = loginForm.querySelector("input[name='email']").value.trim();
      var pass = loginForm.querySelector("input[name='password']").value.trim();

      if (!email || !pass) {
        showAlert("login-alert", "Lütfen e-posta ve şifrenizi girin.", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Bulut Oturumu Doğrulanıyor...";
      }

      try {
        var data = await cloudSignIn(email, pass);
        var u = data.user;
        var metaName = (u.user_metadata && u.user_metadata.username) || email.split("@")[0];
        currentUser = {
          id: u.id,
          email: u.email,
          username: metaName
        };

        var roleLabel = isAdmin(currentUser.email) ? "Yönetici (Admin)" : "Standart Kullanıcı";
        addLog(currentUser.username + " bulut oturumu doğrulandı — Yetki: " + roleLabel);
        loginForm.reset();
        showView("dashboard");
      } catch (err) {
        showAlert("login-alert", err.message || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Giriş Yap";
        }
      }
    });
  }

  function renderRecentUsers(users) {
    var tbody = document.getElementById("recent-users");
    if (!tbody) return;
    tbody.innerHTML = "";

    var list = (users && users.length > 0) ? users.slice(0, 5) : [];
    list.forEach(function (u) {
      var tr = document.createElement("tr");
      var displayName = u.username || (u.email ? u.email.split("@")[0] : "Kullanıcı");
      var letter = displayName.trim().charAt(0).toUpperCase();
      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + displayName + '</span></div>';
      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = u.email || "";
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    });
  }

  function renderUsersTable(users) {
    var tbody = document.getElementById("manage-users-body");
    var emptyEl = document.getElementById("users-empty");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!users || users.length === 0) {
      if (emptyEl) emptyEl.classList.add("visible");
      return;
    }
    if (emptyEl) emptyEl.classList.remove("visible");

    users.forEach(function (user) {
      var tr = document.createElement("tr");
      var displayName = user.username || (user.email ? user.email.split("@")[0] : "Kullanıcı");
      var letter = displayName.trim().charAt(0).toUpperCase();
      var isSelf = currentUser && (currentUser.email === user.email || currentUser.id === user.id);
      var isUserAdmin = isAdmin(user.email);

      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + displayName + '</span></div>';

      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = user.email || "";

      var td3 = document.createElement("td");
      var roleText = isUserAdmin ? "Yönetici" : "Kullanıcı";
      var roleClass = isUserAdmin ? "role-admin" : "role-user";
      td3.innerHTML = '<span class="role-badge ' + roleClass + '">' + roleText + '</span>';

      var td4 = document.createElement("td");
      var btn = document.createElement("button");
      btn.className = "delete-user-btn";
      btn.innerText = "Sil";

      (function (u, self) {
        btn.addEventListener("click", async function () {
          if (self) {
            alert("Güvenlik: Kendi aktif hesabınızı silemezsiniz.");
            return;
          }
          if (confirm(u.email + " kullanıcısını bulut veritabanından kalıcı olarak silmek istiyor musunuz?")) {
            try {
              btn.disabled = true;
              btn.innerText = "Siliniyor...";
              await cloudDeleteUser(u.id, u.email);
              addLog(u.email + " bulut veritabanından silindi");
              await refreshDashboardData();
            } catch (err) {
              alert("Silme işlemi başarısız: " + err.message);
              btn.disabled = false;
              btn.innerText = "Sil";
            }
          }
        });
      })(user, isSelf);

      td4.appendChild(btn);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td4);
      tbody.appendChild(tr);
    });
  }

  function renderDatabaseView() {
    var output = document.getElementById("db-output");
    if (!output) return;
    var q = "";
    var search = document.getElementById("db-search");
    if (search) q = search.value.trim().toLowerCase();

    var list = cachedUsers.slice();
    if (q) {
      list = list.filter(function (u) {
        var un = (u.username || "").toLowerCase();
        var em = (u.email || "").toLowerCase();
        return un.indexOf(q) !== -1 || em.indexOf(q) !== -1;
      });
    }

    var cleanList = list.map(function (item) {
      var copy = Object.assign({}, item);
      delete copy.password;
      return copy;
    });

    output.innerText = JSON.stringify(cleanList, null, 2);
  }

  var dbSearch = document.getElementById("db-search");
  if (dbSearch) {
    dbSearch.addEventListener("input", function () {
      renderDatabaseView();
    });
  }

  function renderChart() {
    if (chartRendered) return;
    chartRendered = true;
    var container = document.getElementById("visitor-chart");
    if (!container) return;
    container.innerHTML = "";

    var days = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
    var vals = [32, 64, 45, 82, 54, 76, 94];

    days.forEach(function (day, i) {
      var col = document.createElement("div");
      col.className = "chart-col";
      var v = document.createElement("span");
      v.className = "chart-val";
      v.innerText = vals[i];
      var bar = document.createElement("div");
      bar.className = "chart-bar";
      var lbl = document.createElement("span");
      lbl.className = "chart-day";
      lbl.innerText = day;

      col.appendChild(v);
      col.appendChild(bar);
      col.appendChild(lbl);
      container.appendChild(col);

      setTimeout(function () {
        bar.style.height = vals[i] + "%";
      }, 100 * i);
    });
  }

  function populateSettings() {
    if (!currentUser) return;
    var un = document.getElementById("set-username");
    var em = document.getElementById("set-email");
    var pw = document.getElementById("set-password");
    if (un) un.value = currentUser.username || "";
    if (em) em.value = currentUser.email || "";
    if (pw) pw.value = "";
    hideAlert("settings-alert");
  }

  var settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideAlert("settings-alert");
      var btn = document.getElementById("settings-submit-btn");
      var newName = document.getElementById("set-username").value.trim();
      var newPass = document.getElementById("set-password").value.trim();

      if (!newName) {
        showAlert("settings-alert", "Kullanıcı adı boş bırakılamaz.", "error");
        return;
      }
      if (newPass && newPass.length < 6) {
        showAlert("settings-alert", "Yeni şifre en az 6 karakter olmalıdır.", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Bulutta Güncelleniyor...";
      }

      try {
        await cloudUpdateUser(newName, newPass);
        updateDashHeader();
        updateNavState();
        addLog("Profil ayarları bulut sunucusunda güncellendi (" + newName + ")");
        showAlert("settings-alert", "Profil bilgileri bulut üzerinde güncellendi.", "success");
        await refreshDashboardData();
      } catch (err) {
        showAlert("settings-alert", err.message || "Güncelleme sırasında hata oluştu.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Değişiklikleri Kaydet";
        }
      }
    });
  }

  var dbExportBtn = document.getElementById("db-export-btn");
  if (dbExportBtn) {
    dbExportBtn.addEventListener("click", function () {
      var exportData = cachedUsers.map(function (u) {
        var copy = Object.assign({}, u);
        delete copy.password;
        return copy;
      });
      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "nexus_cloud_backup_" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
      addLog("Bulut veritabanı dışa aktarıldı (" + exportData.length + " kayıt)");
    });
  }

  var dbImportBtn = document.getElementById("db-import-btn");
  if (dbImportBtn) {
    dbImportBtn.addEventListener("click", function () {
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";
      fileInput.addEventListener("change", function (ev) {
        var file = ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = async function (le) {
          try {
            var data = JSON.parse(le.target.result);
            if (!Array.isArray(data)) {
              alert("Geçersiz format: JSON dosyası bir liste/dizi içermelidir.");
              return;
            }
            if (sbClient) {
              for (var i = 0; i < data.length; i++) {
                var row = data[i];
                var rowObj = {
                  id: row.id || undefined,
                  username: row.username || "Kullanıcı",
                  email: row.email || ("user" + i + "@nexus.cloud"),
                  role: row.role || (isAdmin(row.email) ? "admin" : "user"),
                  created_at: row.created_at || new Date().toISOString()
                };
                await sbClient.from("users").upsert(rowObj);
              }
            }
            addLog("Yedek JSON bulut veritabanına aktarıldı (" + data.length + " kayıt)");
            await refreshDashboardData();
            alert("Yedek başarıyla bulut sunucusuna yüklendi. " + data.length + " kayıt güncellendi.");
          } catch (err) {
            alert("Yedek yükleme hatası: " + err.message);
          }
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });
  }

  var dbResetBtn = document.getElementById("db-reset-btn");
  if (dbResetBtn) {
    dbResetBtn.addEventListener("click", async function () {
      if (confirm("DİKKAT: Bulut veritabanındaki tüm kayıtlar silinecek ve oturumunuz sonlandırılacaktır. Devam etmek istiyor musunuz?")) {
        try {
          await cloudResetDatabase();
          cachedUsers = [];
          systemLogs = [];
          showView("landing");
          alert("Bulut veritabanı temizlendi.");
        } catch (err) {
          alert("Sıfırlama hatası: " + err.message);
        }
      }
    });
  }

  var logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await cloudSignOut();
      showView("landing");
    });
  }

  var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
  var tabPanels = document.querySelectorAll(".tab-panel");

  sidebarItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      var tabId = this.getAttribute("data-tab");
      sidebarItems.forEach(function (si) { si.classList.remove("active"); });
      this.classList.add("active");

      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      var target = document.getElementById(tabId);
      if (target) target.classList.add("active");

      var tabName = this.innerText.trim();
      addLog(tabName + " sekmesine geçildi");

      if (tabId === "tab-users") renderUsersTable(cachedUsers);
      if (tabId === "tab-settings") populateSettings();
      if (tabId === "tab-database") renderDatabaseView();
      if (tabId === "tab-overview") {
        renderRecentUsers(cachedUsers);
        var statUsers = document.getElementById("stat-users");
        if (statUsers) statUsers.innerText = cachedUsers.length;
      }
    });
  });

  function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function updateFluctuatingMetrics() {
    var cpu = document.getElementById("metric-cpu");
    var mem = document.getElementById("metric-mem");
    if (cpu) cpu.innerText = rnd(11, 15) + " %";
    if (mem) mem.innerText = rnd(12, 16) + " MB";
  }

  async function refreshDashboardData() {
    try {
      var users = await cloudFetchUsers();
      var statUsers = document.getElementById("stat-users");
      if (statUsers) statUsers.innerText = users.length;
      renderRecentUsers(users);
      renderUsersTable(users);
      renderDatabaseView();
      addLog("Bulut sunucusundan kullanıcı verileri başarıyla çekildi (" + users.length + " kayıt)");
    } catch (err) {
      addLog("Bulut veri senkronizasyon uyarısı: " + err.message);
    }
  }

  function setupRealtimeListener() {
    if (sbClient && !realtimeChannel) {
      try {
        realtimeChannel = sbClient
          .channel("realtime-users-channel")
          .on("postgres_changes", { event: "*", schema: "public", table: "users" }, function () {
            addLog("Bulut veritabanında anlık değişiklik algılandı");
            refreshDashboardData();
          })
          .subscribe();
      } catch (e) {}
    }
  }

  async function initDashboard() {
    if (!currentUser) {
      showView("login");
      return;
    }
    applyRolePermissions();
    updateDashHeader();
    renderChart();
    await refreshDashboardData();
    setupRealtimeListener();

    addLog(currentUser.username + " yönetim konsoluna bağlandı (" + (isAdmin(currentUser.email) ? "Yönetici" : "Standart Kullanıcı") + ")");
    updateFluctuatingMetrics();

    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(updateFluctuatingMetrics, 3000);

    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(refreshDashboardData, 4000);

    sidebarItems.forEach(function (si) { si.classList.remove("active"); });
    var firstTab = document.querySelector('.sidebar-item[data-tab="tab-overview"]');
    if (firstTab) firstTab.classList.add("active");

    tabPanels.forEach(function (p) { p.classList.remove("active"); });
    var overviewPanel = document.getElementById("tab-overview");
    if (overviewPanel) overviewPanel.classList.add("active");
  }

  async function checkInitialSession() {
    if (sbClient) {
      try {
        var res = await sbClient.auth.getSession();
        if (res.data && res.data.session) {
          var u = res.data.session.user;
          var metaName = (u.user_metadata && u.user_metadata.username) || u.email.split("@")[0];
          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName
          };
          showView("dashboard");
          return;
        }
      } catch (e) {}

      sbClient.auth.onAuthStateChange(function (event, session) {
        if (session && session.user) {
          var u = session.user;
          var metaName = (u.user_metadata && u.user_metadata.username) || u.email.split("@")[0];
          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName
          };
          updateNavState();
        } else {
          currentUser = null;
          updateNavState();
        }
      });
    }

    showView("landing");
  }

  checkInitialSession();
});
