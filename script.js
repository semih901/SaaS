const SUPABASE_CONFIG = {
  url: "https://uwpytmtkdejwzxepimjh.supabase.co/rest/v1/",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cHl0bXRrZGVqd3p4ZXBpbWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzgwODEsImV4cCI6MjEwMTQxNDA4MX0.R48W94A-ut7OklGsxDoNxpqpvdfQA1zjjXiRt5qcM_w"
};

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = SUPABASE_CONFIG.url !== "https://uwpytmtkdejwzxepimjh.supabase.co/rest/v1/" &&
                     SUPABASE_CONFIG.anonKey !== "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cHl0bXRrZGVqd3p4ZXBpbWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzgwODEsImV4cCI6MjEwMTQxNDA4MX0.R48W94A-ut7OklGsxDoNxpqpvdfQA1zjjXiRt5qcM_w" &&
                     window.supabase;

  var sbClient = null;
  if (isConfigured) {
    try {
      sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    } catch (err) {
      sbClient = null;
    }
  }

  var currentSession = null;
  var currentUserProfile = null;
  var cachedUsers = [];
  var systemLogs = [];
  var chartRendered = false;
  var metricsInterval = null;
  var realtimeChannel = null;

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
    }
  }

  function updateNavState() {
    var guest = document.getElementById("nav-guest");
    var authed = document.getElementById("nav-authed");
    var avLanding = document.getElementById("nav-av-landing");

    if (currentSession && currentUserProfile) {
      if (guest) guest.style.display = "none";
      if (authed) authed.style.display = "flex";
      var letter = (currentUserProfile.username || currentUserProfile.email || "U").trim().charAt(0).toUpperCase();
      if (avLanding) avLanding.innerText = letter;
    } else {
      if (guest) guest.style.display = "flex";
      if (authed) authed.style.display = "none";
    }
  }

  function updateDashHeader() {
    if (!currentUserProfile) return;
    var navUsername = document.getElementById("nav-username");
    var navAvatar = document.getElementById("nav-avatar");
    var displayName = currentUserProfile.username || currentUserProfile.email || "Kullanıcı";
    if (navUsername) navUsername.innerText = displayName;
    if (navAvatar) navAvatar.innerText = displayName.trim().charAt(0).toUpperCase();
  }

  document.querySelectorAll("[data-view]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var view = this.getAttribute("data-view");
      if (view === "dashboard" && !currentSession) {
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
    if (sbClient) {
      var res = await sbClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { username: username }
        }
      });
      if (res.error) throw res.error;

      var userId = res.data.user ? res.data.user.id : Date.now().toString();
      await sbClient.from("profiles").upsert({
        id: userId,
        username: username,
        email: email,
        role: "user",
        created_at: new Date().toISOString()
      });
      return res.data;
    } else {
      await new Promise(function (r) { setTimeout(r, 260); });
      var localStore = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
      var exists = localStore.some(function (u) { return u.email === email || u.username === username; });
      if (exists) {
        var err = new Error("Bu e-posta adresi veya kullanıcı adı zaten kayıtlı.");
        throw err;
      }
      var newUser = {
        id: "usr_" + Date.now(),
        username: username,
        email: email,
        password: password,
        role: localStore.length === 0 ? "admin" : "user",
        created_at: new Date().toISOString()
      };
      localStore.push(newUser);
      localStorage.setItem("nexus_cloud_profiles", JSON.stringify(localStore));
      return { user: newUser };
    }
  }

  async function cloudSignIn(email, password) {
    if (sbClient) {
      var res = await sbClient.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (res.error) throw res.error;
      return res.data;
    } else {
      await new Promise(function (r) { setTimeout(r, 220); });
      var localStore = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
      var user = localStore.find(function (u) {
        return (u.email === email || u.username === email) && u.password === password;
      });
      if (!user) {
        var err = new Error("E-posta veya şifre hatalı.");
        throw err;
      }
      return {
        session: { access_token: "token_" + Date.now(), user: user },
        user: user
      };
    }
  }

  async function cloudSignOut() {
    if (sbClient) {
      await sbClient.auth.signOut();
    }
    currentSession = null;
    currentUserProfile = null;
    sessionStorage.removeItem("nexus_session");
    sessionStorage.removeItem("nexus_profile");
  }

  async function cloudFetchProfiles() {
    var t0 = performance.now();
    var profiles = [];

    if (sbClient) {
      var res = await sbClient.from("profiles").select("*").order("created_at", { ascending: false });
      var t1 = performance.now();
      setMetricApi(Math.max(8, Math.round(t1 - t0)));
      if (res.error) throw res.error;
      profiles = res.data || [];
    } else {
      await new Promise(function (r) { setTimeout(r, 140); });
      var t1 = performance.now();
      setMetricApi(Math.max(12, Math.round(t1 - t0)));
      profiles = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
      profiles.sort(function (a, b) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
    }

    cachedUsers = profiles;
    return profiles;
  }

  async function cloudDeleteProfile(profileId, email) {
    var t0 = performance.now();
    if (sbClient) {
      var res = await sbClient.from("profiles").delete().eq("id", profileId);
      var t1 = performance.now();
      setMetricApi(Math.max(8, Math.round(t1 - t0)));
      if (res.error) throw res.error;
    } else {
      await new Promise(function (r) { setTimeout(r, 160); });
      var t1 = performance.now();
      setMetricApi(Math.max(10, Math.round(t1 - t0)));
      var list = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
      list = list.filter(function (p) { return p.id !== profileId && p.email !== email; });
      localStorage.setItem("nexus_cloud_profiles", JSON.stringify(list));
    }
  }

  async function cloudUpdateProfile(newUsername, newPassword) {
    var t0 = performance.now();
    if (sbClient) {
      if (newPassword) {
        var authRes = await sbClient.auth.updateUser({ password: newPassword });
        if (authRes.error) throw authRes.error;
      }
      var dbRes = await sbClient.from("profiles").update({ username: newUsername }).eq("id", currentUserProfile.id);
      var t1 = performance.now();
      setMetricApi(Math.max(8, Math.round(t1 - t0)));
      if (dbRes.error) throw dbRes.error;
    } else {
      await new Promise(function (r) { setTimeout(r, 180); });
      var t1 = performance.now();
      setMetricApi(Math.max(12, Math.round(t1 - t0)));
      var list = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
      var taken = list.some(function (p) { return p.username === newUsername && p.email !== currentUserProfile.email; });
      if (taken) {
        var err = new Error("Bu kullanıcı adı başka bir hesap tarafından kullanılıyor.");
        throw err;
      }
      list = list.map(function (p) {
        if (p.email === currentUserProfile.email) {
          p.username = newUsername;
          if (newPassword) p.password = newPassword;
        }
        return p;
      });
      localStorage.setItem("nexus_cloud_profiles", JSON.stringify(list));
    }

    currentUserProfile.username = newUsername;
    sessionStorage.setItem("nexus_profile", JSON.stringify(currentUserProfile));
  }

  async function cloudResetAll() {
    var t0 = performance.now();
    if (sbClient) {
      await sbClient.from("profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await cloudSignOut();
      var t1 = performance.now();
      setMetricApi(Math.max(10, Math.round(t1 - t0)));
    } else {
      localStorage.removeItem("nexus_cloud_profiles");
      await cloudSignOut();
    }
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
        showAlert("register-alert", "Lütfen tüm alanları eksiksiz doldurun.", "error");
        return;
      }

      if (pass.length < 6) {
        showAlert("register-alert", "Şifreniz en az 6 karakter uzunluğunda olmalıdır.", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Buluta Kaydediliyor...";
      }

      try {
        await cloudSignUp(uname, email, pass);
        addLog("Yeni kullanıcı bulut sunucusuna kaydoldu (" + email + ")");
        showAlert("register-alert", "Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz...", "success");
        registerForm.reset();
        setTimeout(function () {
          hideAlert("register-alert");
          showView("login");
          var loginEmail = document.getElementById("login-email");
          if (loginEmail) loginEmail.value = email;
        }, 1200);
      } catch (err) {
        var msg = err.message || "Kayıt sırasında bir hata oluştu.";
        showAlert("register-alert", msg, "error");
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
        btn.innerText = "Oturum Doğrulanıyor...";
      }

      try {
        var data = await cloudSignIn(email, pass);
        currentSession = data.session;
        var profile = data.user || {};
        if (!profile.username && profile.user_metadata && profile.user_metadata.username) {
          profile.username = profile.user_metadata.username;
        }
        if (!profile.username) {
          profile.username = email.split("@")[0];
        }
        currentUserProfile = {
          id: profile.id || "usr_active",
          email: profile.email || email,
          username: profile.username || email.split("@")[0]
        };

        sessionStorage.setItem("nexus_session", JSON.stringify(currentSession));
        sessionStorage.setItem("nexus_profile", JSON.stringify(currentUserProfile));

        addLog(currentUserProfile.username + " bulut oturumu doğrulandı");
        loginForm.reset();
        showView("dashboard");
      } catch (err) {
        var msg = err.message || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.";
        showAlert("login-alert", msg, "error");
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

    var fallback = [
      { username: "can_developer", email: "can@dev.cloud" },
      { username: "merve_designer", email: "merve@ui.cloud" }
    ];
    var list = (users && users.length > 0) ? users.slice(0, 4) : fallback;

    list.forEach(function (u) {
      var tr = document.createElement("tr");
      var letter = (u.username || u.email || "U").trim().charAt(0).toUpperCase();
      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + (u.username || "Kullanıcı") + '</span></div>';
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

    users.forEach(function (user, idx) {
      var tr = document.createElement("tr");
      var displayName = user.username || user.email.split("@")[0];
      var letter = displayName.trim().charAt(0).toUpperCase();
      var isSelf = currentUserProfile && (currentUserProfile.email === user.email || currentUserProfile.id === user.id);

      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + displayName + '</span></div>';

      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = user.email;

      var td3 = document.createElement("td");
      var roleText = (idx === 0 || user.role === "admin") ? "Yönetici" : "Kullanıcı";
      var roleClass = (idx === 0 || user.role === "admin") ? "role-admin" : "role-user";
      td3.innerHTML = '<span class="role-badge ' + roleClass + '">' + roleText + '</span>';

      var td4 = document.createElement("td");
      var btn = document.createElement("button");
      btn.className = "delete-user-btn";
      btn.innerText = "Sil";

      (function (u, self) {
        btn.addEventListener("click", async function () {
          if (self) {
            alert("Güvenlik: Kendi aktif oturumunuzu silemezsiniz.");
            return;
          }
          if (confirm(u.email + " kullanıcısını bulut veritabanından kalıcı olarak silmek istiyor musunuz?")) {
            try {
              btn.disabled = true;
              btn.innerText = "Siliniyor...";
              await cloudDeleteProfile(u.id, u.email);
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
    if (!currentUserProfile) return;
    var un = document.getElementById("set-username");
    var em = document.getElementById("set-email");
    var pw = document.getElementById("set-password");
    if (un) un.value = currentUserProfile.username || "";
    if (em) em.value = currentUserProfile.email || "";
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
        btn.innerText = "Güncelleniyor...";
      }

      try {
        await cloudUpdateProfile(newName, newPass);
        updateDashHeader();
        updateNavState();
        addLog("Profil ayarları bulut sunucusunda güncellendi (" + newName + ")");
        showAlert("settings-alert", "Profil bilgileri başarıyla güncellendi.", "success");
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
                await sbClient.from("profiles").upsert({
                  id: row.id || ("usr_" + Date.now() + "_" + i),
                  username: row.username || "Kullanıcı",
                  email: row.email || ("user" + i + "@nexus.cloud"),
                  role: row.role || "user",
                  created_at: row.created_at || new Date().toISOString()
                });
              }
            } else {
              var existing = JSON.parse(localStorage.getItem("nexus_cloud_profiles")) || [];
              data.forEach(function (row) {
                var idx = existing.findIndex(function (ex) { return ex.email === row.email; });
                if (idx !== -1) {
                  existing[idx] = Object.assign(existing[idx], row);
                } else {
                  existing.push(row);
                }
              });
              localStorage.setItem("nexus_cloud_profiles", JSON.stringify(existing));
            }
            addLog("Yedek JSON dosyası bulut veritabanına yazıldı (" + data.length + " kayıt)");
            await refreshDashboardData();
            alert("Yedek başarıyla içeri aktarıldı. " + data.length + " kayıt senkronize edildi.");
          } catch (err) {
            alert("Yedek içe aktarma hatası: " + err.message);
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
          await cloudResetAll();
          if (metricsInterval) {
            clearInterval(metricsInterval);
            metricsInterval = null;
          }
          cachedUsers = [];
          systemLogs = [];
          showView("landing");
          alert("Bulut veritabanı sıfırlandı.");
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
      if (metricsInterval) {
        clearInterval(metricsInterval);
        metricsInterval = null;
      }
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
      var profiles = await cloudFetchProfiles();
      var statUsers = document.getElementById("stat-users");
      if (statUsers) statUsers.innerText = profiles.length;
      renderRecentUsers(profiles);
      renderUsersTable(profiles);
      renderDatabaseView();
    } catch (err) {
      addLog("Bulut veri senkronizasyon hatası: " + err.message);
    }
  }

  function setupRealtimeListener() {
    if (sbClient && !realtimeChannel) {
      realtimeChannel = sbClient
        .channel("public:profiles")
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, function (payload) {
          addLog("Bulut veritabanında anlık değişiklik algılandı");
          refreshDashboardData();
        })
        .subscribe();
    }
  }

  async function initDashboard() {
    if (!currentSession) {
      showView("login");
      return;
    }
    updateDashHeader();
    renderChart();
    await refreshDashboardData();
    setupRealtimeListener();

    addLog(currentUserProfile.username + " yönetim konsoluna bağlandı");
    updateFluctuatingMetrics();

    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(updateFluctuatingMetrics, 3000);

    sidebarItems.forEach(function (si) { si.classList.remove("active"); });
    var firstTab = document.querySelector('.sidebar-item[data-tab="tab-overview"]');
    if (firstTab) firstTab.classList.add("active");

    tabPanels.forEach(function (p) { p.classList.remove("active"); });
    var overviewPanel = document.getElementById("tab-overview");
    if (overviewPanel) overviewPanel.classList.add("active");
  }

  async function checkInitialSession() {
    var savedSession = sessionStorage.getItem("nexus_session");
    var savedProfile = sessionStorage.getItem("nexus_profile");

    if (savedSession && savedProfile) {
      try {
        currentSession = JSON.parse(savedSession);
        currentUserProfile = JSON.parse(savedProfile);
        showView("dashboard");
        return;
      } catch (e) {
        sessionStorage.removeItem("nexus_session");
        sessionStorage.removeItem("nexus_profile");
      }
    }

    if (sbClient) {
      var res = await sbClient.auth.getSession();
      if (res.data && res.data.session) {
        currentSession = res.data.session;
        var user = res.data.session.user;
        currentUserProfile = {
          id: user.id,
          email: user.email,
          username: (user.user_metadata && user.user_metadata.username) || user.email.split("@")[0]
        };
        sessionStorage.setItem("nexus_session", JSON.stringify(currentSession));
        sessionStorage.setItem("nexus_profile", JSON.stringify(currentUserProfile));
        showView("dashboard");
        return;
      }
    }

    showView("landing");
  }

  checkInitialSession();
});
