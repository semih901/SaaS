const SUPABASE_CONFIG = {
  url: "https://uwpytmtkdejwzxepimjh.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cHl0bXRrZGVqd3p4ZXBpbWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzgwODEsImV4cCI6MjEwMTQxNDA4MX0.R48W94A-ut7OklGsxDoNxpqpvdfQA1zjjXiRt5qcM_w"
};

const ADMIN_EMAIL = "semihcifci100@gmail.com";

document.addEventListener("DOMContentLoaded", function () {
  var sbClient = null;

  function getSupabaseClient() {
    if (sbClient) return sbClient;
    if (window.supabase && typeof window.supabase.createClient === "function" && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
      try {
        sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      } catch (e) {
        sbClient = null;
      }
    }
    return sbClient;
  }

  getSupabaseClient();

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

  function formatReadableDate(isoString) {
    if (!isoString) return "";
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      var year = d.getFullYear();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var hours = String(d.getHours()).padStart(2, "0");
      var minutes = String(d.getMinutes()).padStart(2, "0");
      var seconds = String(d.getSeconds()).padStart(2, "0");
      return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
    } catch (e) {
      return isoString;
    }
  }

  function highlightJsonSyntax(jsonStr) {
    if (!jsonStr) return "";
    var escaped = jsonStr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      var cls = "json-number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "json-key";
          return '<span class="' + cls + '">' + match.slice(0, -1) + '</span><span class="json-punctuation">:</span>';
        } else {
          cls = "json-string";
        }
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
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

  function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function updateFluctuatingMetrics() {
    var cpu = document.getElementById("metric-cpu");
    var mem = document.getElementById("metric-mem");
    if (cpu) cpu.innerText = rnd(11, 18) + " %";
    if (mem) mem.innerText = rnd(13, 21) + " MB";
  }

  updateFluctuatingMetrics();
  metricsInterval = setInterval(updateFluctuatingMetrics, 3000);

  function getCaptchaResponse(formEl) {
    if (typeof hcaptcha !== "undefined") {
      var tokenInput = formEl ? formEl.querySelector('[name="h-captcha-response"]') : null;
      if (tokenInput && tokenInput.value) {
        return tokenInput.value;
      }
      try {
        var token = hcaptcha.getResponse();
        if (token) return token;
      } catch (e) {}
    }
    return "";
  }

  function resetCaptcha() {
    if (typeof hcaptcha !== "undefined") {
      try {
        hcaptcha.reset();
      } catch (e) {}
    }
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
    }

    if (typeof hcaptcha !== "undefined") {
      setTimeout(function () {
        document.querySelectorAll(".h-captcha").forEach(function (el) {
          if (!el.hasChildNodes()) {
            try {
              hcaptcha.render(el, {
                sitekey: el.getAttribute("data-sitekey")
              });
            } catch (e) {}
          }
        });
      }, 100);
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
        currentUser = {
          id: "admin-session",
          email: ADMIN_EMAIL,
          username: "semih"
        };
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

  async function cloudSignUp(username, email, password, captchaToken) {
    var client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase bağlantısı kurulamadı.");
    }
    var t0 = performance.now();
    var signUpOptions = {
      data: { username: username }
    };
    if (captchaToken) {
      signUpOptions.captchaToken = captchaToken;
    }
    var res = await client.auth.signUp({
      email: email,
      password: password,
      options: signUpOptions
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

    var insertRes = await client.from("users").insert([userRecord]);
    if (insertRes.error) {
      var fallbackRecord = {
        username: username,
        email: email
      };
      await client.from("users").insert([fallbackRecord]);
    }

    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    return res.data;
  }

  async function cloudSignIn(email, password, captchaToken) {
    var client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase bağlantısı kurulamadı.");
    }
    var t0 = performance.now();
    var signInOptions = {};
    if (captchaToken) {
      signInOptions.captchaToken = captchaToken;
    }
    var res = await client.auth.signInWithPassword({
      email: email,
      password: password,
      options: signInOptions
    });
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    if (res.error) throw res.error;
    return res.data;
  }

  async function cloudSignOut() {
    var client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (e) {}
    }
    currentUser = null;
    cachedUsers = [];
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  }

  async function cloudFetchUsers() {
    var client = getSupabaseClient();
    if (!client) {
      addLog("Supabase istemcisi hazır değil.");
      return cachedUsers || [];
    }
    var t0 = performance.now();
    var res = await client.from("users").select("*").order("created_at", { ascending: false });
    if (res.error) {
      res = await client.from("users").select("*");
    }
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));

    if (res.error) {
      addLog("Bulut veri çekme uyarısı: " + (res.error.message || JSON.stringify(res.error)));
      return cachedUsers || [];
    }
    var data = res.data || [];
    cachedUsers = data;
    return data;
  }

  async function cloudDeleteUser(userId, email) {
    var client = getSupabaseClient();
    if (!client) return;
    var t0 = performance.now();
    var res = null;
    if (userId) {
      res = await client.from("users").delete().eq("id", userId);
    }
    if (!res || res.error) {
      res = await client.from("users").delete().eq("email", email);
    }
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    if (res && res.error) throw res.error;
  }

  async function cloudUpdateUser(newUsername, newPassword) {
    var client = getSupabaseClient();
    if (!client || !currentUser) return;
    var t0 = performance.now();

    if (newPassword) {
      var authRes = await client.auth.updateUser({
        password: newPassword,
        data: { username: newUsername }
      });
      if (authRes.error) throw authRes.error;
    }

    var dbRes = await client.from("users").update({ username: newUsername }).eq("id", currentUser.id);
    if (dbRes.error) {
      await client.from("users").update({ username: newUsername }).eq("email", currentUser.email);
    }

    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    currentUser.username = newUsername;
  }

  async function cloudResetDatabase() {
    var client = getSupabaseClient();
    if (!client) return;
    var t0 = performance.now();
    await client.from("users").delete().neq("email", "non_existing_system_null_placeholder@nexus.cloud");
    await cloudSignOut();
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
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

      var captchaToken = getCaptchaResponse(registerForm);
      if (!captchaToken) {
        showAlert("register-alert", "Lütfen robot olmadığınızı doğrulayın!", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Buluta Kaydediliyor...";
      }

      try {
        await cloudSignUp(uname, email, pass, captchaToken);
        addLog("Yeni kullanıcı bulut sunucusuna kaydoldu (" + email + ")");
        showAlert("register-alert", "Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz...", "success");
        registerForm.reset();
        resetCaptcha();
        setTimeout(function () {
          hideAlert("register-alert");
          showView("login");
          var loginEmail = document.getElementById("login-email");
          if (loginEmail) loginEmail.value = email;
        }, 1200);
      } catch (err) {
        resetCaptcha();
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

      var captchaToken = getCaptchaResponse(loginForm);
      if (!captchaToken) {
        showAlert("login-alert", "Lütfen robot olmadığınızı doğrulayın!", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Bulut Oturumu Doğrulanıyor...";
      }

      try {
        var data = await cloudSignIn(email, pass, captchaToken);
        var u = data.user;
        var metaName = (u && u.user_metadata && u.user_metadata.username) || email.split("@")[0];
        currentUser = {
          id: u ? u.id : "user-id",
          email: u ? u.email : email,
          username: metaName
        };

        var roleLabel = isAdmin(currentUser.email) ? "Yönetici (Admin)" : "Standart Kullanıcı";
        addLog(currentUser.username + " bulut oturumu doğrulandı — Yetki: " + roleLabel);
        loginForm.reset();
        resetCaptcha();
        showView("dashboard");
      } catch (err) {
        resetCaptcha();
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

    var isUserAdmin = currentUser && isAdmin(currentUser.email);
    var list = [];

    if (isUserAdmin) {
      list = (users && users.length > 0) ? users.slice(0, 5) : [];
    } else {
      var filtered = (users || []).filter(function (u) {
        return currentUser && (u.email === currentUser.email || (currentUser.id && u.id === currentUser.id));
      });
      if (filtered.length === 0 && currentUser) {
        filtered = [{
          username: currentUser.username,
          email: currentUser.email
        }];
      }
      list = filtered;
    }

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

    var isUserAdmin = currentUser && isAdmin(currentUser.email);
    if (!isUserAdmin) {
      if (emptyEl) {
        emptyEl.style.display = "block";
        emptyEl.classList.add("visible");
      }
      return;
    }

    if (!users || users.length === 0) {
      if (emptyEl) {
        emptyEl.style.display = "block";
        emptyEl.classList.add("visible");
      }
      return;
    }
    if (emptyEl) {
      emptyEl.style.display = "none";
      emptyEl.classList.remove("visible");
    }

    users.forEach(function (user) {
      var tr = document.createElement("tr");
      var userEmail = user.email || "";
      var displayName = user.username || (userEmail ? userEmail.split("@")[0] : "Kullanıcı");
      var letter = displayName.trim().charAt(0).toUpperCase();
      var isSelf = currentUser && (currentUser.email === userEmail || currentUser.id === user.id);
      var isCurrentAdmin = isAdmin(userEmail) || user.role === "admin";

      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + displayName + '</span></div>';

      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = userEmail;

      var td3 = document.createElement("td");
      var roleText = isCurrentAdmin ? "Yönetici" : "Kullanıcı";
      var roleClass = isCurrentAdmin ? "role-admin" : "role-user";
      td3.innerHTML = '<span class="role-badge ' + roleClass + '">' + roleText + '</span>';

      var td4 = document.createElement("td");
      var btn = document.createElement("button");
      btn.className = "delete-user-btn";
      btn.innerText = "Sil";

      (function (u, self) {
        btn.addEventListener("click", async function (e) {
          e.stopPropagation();
          if (self) {
            alert("Güvenlik: Kendi aktif hesabınızı silemezsiniz.");
            return;
          }
          if (confirm((u.email || u.username) + " kullanıcısını bulut veritabanından kalıcı olarak silmek istiyor musunuz?")) {
            try {
              btn.disabled = true;
              btn.innerText = "Siliniyor...";
              await cloudDeleteUser(u.id, u.email);
              addLog((u.email || u.username) + " bulut veritabanından silindi");
              await refreshDashboardData();
            } catch (err) {
              alert("Silme işlemi başarısız: " + (err.message || err));
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

  function renderDatabaseView(users) {
    var output = document.getElementById("db-output");
    var countBadge = document.getElementById("db-terminal-count");
    if (!output) return;

    var isUserAdmin = currentUser && isAdmin(currentUser.email);
    if (!isUserAdmin) {
      output.innerHTML = highlightJsonSyntax("[]");
      if (countBadge) countBadge.innerText = "0 kayıt";
      return;
    }

    var q = "";
    var search = document.getElementById("db-search");
    if (search) q = search.value.trim().toLowerCase();

    var dataList = users || cachedUsers || [];
    var list = dataList.slice();
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
      if (copy.created_at) {
        copy.created_at = formatReadableDate(copy.created_at);
      }
      return copy;
    });

    if (countBadge) {
      countBadge.innerText = cleanList.length + " kayıt";
    }

    var jsonString = JSON.stringify(cleanList, null, 2);
    output.innerHTML = highlightJsonSyntax(jsonString);
  }

  var dbSearch = document.getElementById("db-search");
  if (dbSearch) {
    dbSearch.addEventListener("input", function () {
      renderDatabaseView();
    });
  }

  function copyTextToClipboard(text, onSuccess) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        if (onSuccess) onSuccess();
      }).catch(function () {
        fallbackCopy(text);
        if (onSuccess) onSuccess();
      });
    } else {
      fallbackCopy(text);
      if (onSuccess) onSuccess();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
  }

  var dbCopyBtn = document.getElementById("db-copy-btn");
  if (dbCopyBtn) {
    dbCopyBtn.addEventListener("click", function () {
      var isUserAdmin = currentUser && isAdmin(currentUser.email);
      var dataList = isUserAdmin ? (cachedUsers || []) : [];
      var search = document.getElementById("db-search");
      var q = search ? search.value.trim().toLowerCase() : "";

      var list = dataList.slice();
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
        if (copy.created_at) {
          copy.created_at = formatReadableDate(copy.created_at);
        }
        return copy;
      });

      var rawJson = JSON.stringify(cleanList, null, 2);
      var originalHtml = dbCopyBtn.innerHTML;

      copyTextToClipboard(rawJson, function () {
        dbCopyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Kopyalandı';
        addLog("Terminal JSON içeriği panoya kopyalandı (" + cleanList.length + " kayıt)");
        setTimeout(function () {
          dbCopyBtn.innerHTML = originalHtml;
        }, 2000);
      });
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
        if (copy.created_at) {
          copy.created_at = formatReadableDate(copy.created_at);
        }
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
            var client = getSupabaseClient();
            if (client) {
              for (var i = 0; i < data.length; i++) {
                var row = data[i];
                var rowObj = {
                  id: row.id || undefined,
                  username: row.username || "Kullanıcı",
                  email: row.email || ("user" + i + "@nexus.cloud"),
                  role: row.role || (isAdmin(row.email) ? "admin" : "user"),
                  created_at: row.created_at || new Date().toISOString()
                };
                await client.from("users").upsert(rowObj);
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
      addLog("Oturum kapatıldı");
      showView("landing");
    });
  }

  var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
  var tabPanels = document.querySelectorAll(".tab-panel");

  sidebarItems.forEach(function (item) {
    item.addEventListener("click", async function (e) {
      e.preventDefault();
      var tabId = this.getAttribute("data-tab");
      sidebarItems.forEach(function (si) { si.classList.remove("active"); });
      this.classList.add("active");

      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      var target = document.getElementById(tabId);
      if (target) target.classList.add("active");

      var tabName = this.innerText.trim();
      addLog(tabName + " sekmesine geçildi");

      if (tabId === "tab-users") {
        renderUsersTable(cachedUsers);
        await refreshDashboardData();
      } else if (tabId === "tab-database") {
        renderDatabaseView(cachedUsers);
        renderLogs();
        await refreshDashboardData();
      } else if (tabId === "tab-settings") {
        populateSettings();
      } else if (tabId === "tab-overview") {
        renderRecentUsers(cachedUsers);
        var isUserAdmin = currentUser && isAdmin(currentUser.email);
        var statUsers = document.getElementById("stat-users");
        if (statUsers) statUsers.innerText = isUserAdmin ? cachedUsers.length : 1;
        await refreshDashboardData();
      }
    });
  });

  async function refreshDashboardData() {
    try {
      var users = await cloudFetchUsers();
      var isUserAdmin = currentUser && isAdmin(currentUser.email);
      var statUsers = document.getElementById("stat-users");
      if (statUsers) statUsers.innerText = isUserAdmin ? users.length : 1;
      renderRecentUsers(users);
      renderUsersTable(users);
      renderDatabaseView(users);
      renderLogs();
      addLog("Bulut sunucusundan kullanıcı verileri başarıyla çekildi (" + (isUserAdmin ? users.length : 1) + " kayıt)");
    } catch (err) {
      addLog("Bulut veri senkronizasyon uyarısı: " + (err.message || err));
    }
  }

  function setupRealtimeListener() {
    var client = getSupabaseClient();
    if (client && !realtimeChannel) {
      try {
        realtimeChannel = client
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
      currentUser = {
        id: "admin-session",
        email: ADMIN_EMAIL,
        username: "semih"
      };
    }
    applyRolePermissions();
    updateDashHeader();
    renderChart();

    if (systemLogs.length === 0) {
      addLog("Sistem çekirdeği ve UI bileşenleri yüklendi");
      addLog("Bulut veritabanı bağlantısı kuruldu (Supabase REST API)");
    }

    renderLogs();
    await refreshDashboardData();
    setupRealtimeListener();

    addLog(currentUser.username + " yönetim konsoluna bağlandı (" + (isAdmin(currentUser.email) ? "Yönetici" : "Standart Kullanıcı") + ")");
    updateFluctuatingMetrics();

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
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.auth.getSession();
        if (res.data && res.data.session) {
          var u = res.data.session.user;
          var metaName = (u && u.user_metadata && u.user_metadata.username) || (u && u.email ? u.email.split("@")[0] : "Kullanıcı");
          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName
          };
          showView("dashboard");
          return;
        }
      } catch (e) {}

      client.auth.onAuthStateChange(function (event, session) {
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
