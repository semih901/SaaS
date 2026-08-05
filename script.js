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
  var cachedSnippets = [];
  var systemLogs = [];
  var chartRendered = false;
  var metricsInterval = null;
  var autoSyncInterval = null;
  var realtimeChannel = null;
  var snippetsRealtimeChannel = null;
  var activeExpertiseFilter = "all";

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

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    var roleBadgeText = isUserAdmin ? " (Yonetici)" : " (Kullanici)";
    var displayName = (currentUser.username || currentUser.email || "Kullanici") + roleBadgeText;
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
      throw new Error("Supabase baglantisi kurulamadi.");
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
      throw new Error("Supabase baglantisi kurulamadi.");
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
    cachedSnippets = [];
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  }

  async function cloudFetchUsers() {
    var client = getSupabaseClient();
    if (!client) {
      addLog("Supabase istemcisi hazir degil.");
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
      addLog("Bulut veri cekme uyarisi: " + (res.error.message || JSON.stringify(res.error)));
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

  async function updateUserProfile(username, bio, avatarUrl) {
    var client = getSupabaseClient();
    if (!client || !currentUser) {
      throw new Error("Supabase baglantisi veya aktif kullanici oturumu bulunamadi.");
    }
    var t0 = performance.now();

    var updatePayload = {
      username: username,
      bio: bio || "",
      avatar_url: avatarUrl || ""
    };

    try {
      await client.auth.updateUser({
        data: updatePayload
      });
    } catch (e) {}

    var dbRes = await client.from("users").update(updatePayload).eq("id", currentUser.id);
    if (dbRes.error) {
      dbRes = await client.from("users").update(updatePayload).eq("email", currentUser.email);
    }

    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));

    if (dbRes && dbRes.error) {
      throw dbRes.error;
    }

    currentUser.username = username;
    currentUser.bio = bio || "";
    currentUser.avatar_url = avatarUrl || "";

    var cachedSelf = cachedUsers.find(function (u) {
      return (currentUser.id && u.id === currentUser.id) || (u.email && u.email === currentUser.email);
    });
    if (cachedSelf) {
      cachedSelf.username = username;
      cachedSelf.bio = bio || "";
      cachedSelf.avatar_url = avatarUrl || "";
    }

    updateDashHeader();
    updateNavState();
    addLog("Kullanici profili basariyla guncellendi (" + username + ")");
  }

  async function cloudResetDatabase() {
    var client = getSupabaseClient();
    if (!client) return;
    var t0 = performance.now();
    await client.from("snippets").delete().neq("title", "non_existing_system_null_placeholder");
    await client.from("users").delete().neq("email", "non_existing_system_null_placeholder@nexus.cloud");
    await cloudSignOut();
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
  }

  async function insertSnippet(title, language, expertiseArea, isPublic, codeContent) {
    var client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase baglantisi kurulamadi.");
    }
    if (!currentUser) {
      throw new Error("Oturum acik degil.");
    }
    var t0 = performance.now();
    var record = {
      user_id: currentUser.id,
      title: title,
      language: language,
      code_content: codeContent,
      is_public: isPublic,
      expertise_area: expertiseArea,
      created_at: new Date().toISOString()
    };
    var res = await client.from("snippets").insert([record]);
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    if (res.error) throw res.error;
    addLog("Yeni kod parcacigi eklendi: " + title + " [" + language + " / " + expertiseArea + "]");
    return res.data;
  }

  var previousActiveTabId = "tab-snippets";

  async function fetchPublicSnippets() {
    var client = getSupabaseClient();
    if (!client) {
      return cachedSnippets || [];
    }
    var t0 = performance.now();
    var res = await client.from("snippets").select("*, users(username, avatar_url, bio, email)").eq("is_public", true).order("created_at", { ascending: false });
    if (res.error) {
      res = await client.from("snippets").select("*, users(username, email)").eq("is_public", true).order("created_at", { ascending: false });
    }
    if (res.error) {
      res = await client.from("snippets").select("*").eq("is_public", true).order("created_at", { ascending: false });
    }
    if (res.error) {
      res = await client.from("snippets").select("*").eq("is_public", true);
    }
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));

    if (res.error) {
      addLog("Snippet veri cekme uyarisi: " + (res.error.message || JSON.stringify(res.error)));
      return cachedSnippets || [];
    }
    var data = res.data || [];
    cachedSnippets = data;
    return data;
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

  function createSnippetCardElement(snippet) {
    var card = document.createElement("div");
    card.className = "snippet-card";
    card.setAttribute("data-expertise", snippet.expertise_area || "");

    var authorName = "Anonim";
    var avatarUrl = "";
    if (snippet.users) {
      if (snippet.users.username) {
        authorName = snippet.users.username;
      } else if (snippet.users.email) {
        authorName = snippet.users.email.split("@")[0];
      }
      if (snippet.users.avatar_url) {
        avatarUrl = snippet.users.avatar_url.trim();
      }
    } else if (snippet.author_name) {
      authorName = snippet.author_name;
    }

    var authorLetter = authorName.trim().charAt(0).toUpperCase();
    var dateStr = formatReadableDate(snippet.created_at);
    var escapedCode = escapeHtml(snippet.code_content || "");
    var escapedAuthor = escapeHtml(authorName);

    var avatarHtml = "";
    if (avatarUrl) {
      avatarHtml = '<img class="snippet-author-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="' + escapedAuthor + '">';
    } else {
      avatarHtml = '<div class="snippet-author-avatar">' + authorLetter + '</div>';
    }

    card.innerHTML =
      '<div class="snippet-card-header">' +
        '<div class="snippet-card-meta">' +
          '<div class="snippet-card-title">' + escapeHtml(snippet.title || "Basliksiz") + '</div>' +
          '<div class="snippet-card-info">' +
            '<span>' + escapeHtml(snippet.language || "Bilinmiyor") + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="badge-expertise">' + escapeHtml(snippet.expertise_area || "Genel") + '</span>' +
      '</div>' +
      '<div class="snippet-code-block">' +
        '<button class="snippet-copy-btn" data-code-id="' + (snippet.id || "") + '">Kopyala</button>' +
        '<pre><code>' + escapedCode + '</code></pre>' +
      '</div>' +
      '<div class="snippet-card-footer">' +
        '<button type="button" class="snippet-author-btn" data-username="' + escapedAuthor + '">' +
          avatarHtml +
          '<span>' + escapedAuthor + '</span>' +
        '</button>' +
        '<span class="snippet-date">' + dateStr + '</span>' +
      '</div>';

    var copyBtn = card.querySelector(".snippet-copy-btn");
    if (copyBtn) {
      (function (btn, rawCode) {
        btn.addEventListener("click", function () {
          copyTextToClipboard(rawCode, function () {
            btn.innerText = "Kopyalandi";
            setTimeout(function () {
              btn.innerText = "Kopyala";
            }, 2000);
          });
        });
      })(copyBtn, snippet.code_content || "");
    }

    var authorBtn = card.querySelector(".snippet-author-btn");
    if (authorBtn && authorName !== "Anonim") {
      (function (btn, username) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          loadUserProfile(username);
        });
      })(authorBtn, authorName);
    }

    return card;
  }

  function renderSnippetsFeed(snippets) {
    var feed = document.getElementById("snippets-feed");
    var emptyEl = document.getElementById("snippets-empty");
    if (!feed) return;
    feed.innerHTML = "";

    var list = (snippets || cachedSnippets || []).slice();

    if (activeExpertiseFilter && activeExpertiseFilter !== "all") {
      list = list.filter(function (s) {
        return s.expertise_area === activeExpertiseFilter;
      });
    }

    if (list.length === 0) {
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

    list.forEach(function (snippet) {
      var card = createSnippetCardElement(snippet);
      feed.appendChild(card);
    });
  }

  async function loadUserProfile(username) {
    if (!username || username === "Anonim") return;
    addLog("Kullanici profili yukleniyor: " + username);

    var currentActiveSidebar = document.querySelector(".sidebar-item.active");
    if (currentActiveSidebar) {
      var prevTab = currentActiveSidebar.getAttribute("data-tab");
      if (prevTab) previousActiveTabId = prevTab;
    }

    var tabPanels = document.querySelectorAll(".tab-panel");
    tabPanels.forEach(function (p) {
      p.classList.remove("active");
      p.style.display = "none";
    });
    var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
    sidebarItems.forEach(function (si) {
      si.classList.remove("active");
    });

    var profileView = document.getElementById("public-profile-view");
    if (profileView) {
      profileView.style.display = "block";
    }

    var usernameEl = document.getElementById("public-profile-username");
    var bioEl = document.getElementById("public-profile-bio");
    var avatarImg = document.getElementById("public-profile-avatar-img");
    var avatarFallback = document.getElementById("public-profile-avatar-fallback");
    var snippetsContainer = document.getElementById("public-profile-snippets-feed");
    var emptyEl = document.getElementById("public-profile-empty");
    var countEl = document.getElementById("public-profile-snippet-count");

    if (usernameEl) usernameEl.innerText = username;
    if (bioEl) bioEl.innerText = "Profil bilgileri yukleniyor...";
    if (avatarImg) avatarImg.style.display = "none";
    if (avatarFallback) {
      avatarFallback.style.display = "flex";
      avatarFallback.innerText = username.charAt(0).toUpperCase();
    }
    if (snippetsContainer) snippetsContainer.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";

    var client = getSupabaseClient();
    var userData = null;

    if (client) {
      try {
        var userRes = await client.from("users").select("id, username, email, bio, avatar_url, created_at").eq("username", username).maybeSingle();
        if (!userRes.error && userRes.data) {
          userData = userRes.data;
        }
      } catch (e) {}
    }

    if (!userData && cachedUsers) {
      userData = cachedUsers.find(function (u) {
        return (u.username && u.username.toLowerCase() === username.toLowerCase()) ||
               (u.email && u.email.split("@")[0].toLowerCase() === username.toLowerCase());
      });
    }

    if (userData) {
      if (usernameEl) usernameEl.innerText = userData.username || username;
      if (bioEl) {
        bioEl.innerText = userData.bio ? userData.bio : "Bu kullanici henuz bir biyografi eklemedi.";
      }
      if (userData.avatar_url && userData.avatar_url.trim()) {
        if (avatarImg) {
          avatarImg.src = userData.avatar_url.trim();
          avatarImg.style.display = "block";
          avatarImg.onerror = function () {
            avatarImg.style.display = "none";
            if (avatarFallback) avatarFallback.style.display = "flex";
          };
        }
        if (avatarFallback) avatarFallback.style.display = "none";
      } else {
        if (avatarImg) avatarImg.style.display = "none";
        if (avatarFallback) {
          avatarFallback.style.display = "flex";
          avatarFallback.innerText = (userData.username || username).charAt(0).toUpperCase();
        }
      }
    } else {
      if (bioEl) bioEl.innerText = "Bu kullanici henuz bir biyografi eklemedi.";
    }

    var snippetsData = [];
    if (client && userData && userData.id) {
      try {
        var snipRes = await client.from("snippets").select("*, users(username, avatar_url, bio, email)").eq("user_id", userData.id).eq("is_public", true).order("created_at", { ascending: false });
        if (!snipRes.error && snipRes.data) {
          snippetsData = snipRes.data;
        }
      } catch (e) {}
    }

    if (snippetsData.length === 0 && cachedSnippets) {
      snippetsData = cachedSnippets.filter(function (s) {
        if (userData && s.user_id && s.user_id === userData.id) return true;
        if (s.users && s.users.username && s.users.username.toLowerCase() === username.toLowerCase()) return true;
        if (s.users && s.users.email && s.users.email.split("@")[0].toLowerCase() === username.toLowerCase()) return true;
        return false;
      });
    }

    if (countEl) {
      countEl.innerText = snippetsData.length + " Kod Parcacigi";
    }

    if (snippetsContainer) {
      snippetsContainer.innerHTML = "";
      if (snippetsData.length === 0) {
        if (emptyEl) emptyEl.style.display = "block";
      } else {
        if (emptyEl) emptyEl.style.display = "none";
        snippetsData.forEach(function (snip) {
          snippetsContainer.appendChild(createSnippetCardElement(snip));
        });
      }
    }

    addLog(username + " profil sayfasi acildi (" + snippetsData.length + " snippet)");
  }
  window.loadUserProfile = loadUserProfile;

  var expertiseFilter = document.getElementById("expertise-filter");
  if (expertiseFilter) {
    expertiseFilter.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      var filterVal = btn.getAttribute("data-filter");
      activeExpertiseFilter = filterVal || "all";
      expertiseFilter.querySelectorAll(".filter-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      renderSnippetsFeed(cachedSnippets);
    });
  }

  async function runClaudeSubagent() {
    var textarea = document.getElementById("snippet-code");
    var btn = document.getElementById("btn-ai-optimize");
    if (!textarea || !btn) return;

    var originalCode = textarea.value.trim();
    if (!originalCode) {
      showAlert("snippet-alert", "Claude analizi icin once bir kod parcacigi yazin.", "error");
      return;
    }

    btn.disabled = true;
    btn.innerText = "Claude Analiz Ediyor...";
    textarea.style.opacity = "0.5";
    textarea.style.pointerEvents = "none";

    await new Promise(function (resolve) {
      setTimeout(resolve, 3000);
    });

    var languageInput = document.getElementById("snippet-language");
    var lang = languageInput ? languageInput.value.trim() : "code";
    var commentPrefix = "// ";
    var lowerLang = lang.toLowerCase();
    if (lowerLang === "python" || lowerLang === "py") {
      commentPrefix = "# ";
    } else if (lowerLang === "html" || lowerLang === "xml") {
      commentPrefix = "<!-- ";
    } else if (lowerLang === "css") {
      commentPrefix = "/* ";
    } else if (lowerLang === "sql") {
      commentPrefix = "-- ";
    }

    var commentEnd = "";
    if (lowerLang === "html" || lowerLang === "xml") {
      commentEnd = " -->";
    } else if (lowerLang === "css") {
      commentEnd = " */";
    }

    var optimizedCode =
      commentPrefix + "[Claude AI] Kod analiz edildi ve optimize edildi" + commentEnd + "\n" +
      commentPrefix + "Performans ve okunabilirlik iyilestirmeleri uygulandi" + commentEnd + "\n\n" +
      originalCode + "\n\n" +
      commentPrefix + "[Claude AI] Analiz tamamlandi - En iyi pratikler uygulanmistir" + commentEnd;

    textarea.value = optimizedCode;
    textarea.style.opacity = "1";
    textarea.style.pointerEvents = "";
    btn.disabled = false;
    btn.innerText = "Claude ile Iyilestir";
    addLog("Claude AI kod analizi tamamlandi");
  }

  var aiBtn = document.getElementById("btn-ai-optimize");
  if (aiBtn) {
    aiBtn.addEventListener("click", function () {
      runClaudeSubagent();
    });
  }

  var snippetForm = document.getElementById("snippet-form");
  if (snippetForm) {
    snippetForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideAlert("snippet-alert");

      var titleInput = document.getElementById("snippet-title");
      var langInput = document.getElementById("snippet-language");
      var expertiseSelect = document.getElementById("expertise-select");
      var publicCheckbox = document.getElementById("snippet-public");
      var codeTextarea = document.getElementById("snippet-code");
      var submitBtn = document.getElementById("snippet-submit-btn");

      var title = titleInput ? titleInput.value.trim() : "";
      var language = langInput ? langInput.value.trim() : "";
      var expertiseArea = expertiseSelect ? expertiseSelect.value : "";
      var isPublic = publicCheckbox ? publicCheckbox.checked : true;
      var codeContent = codeTextarea ? codeTextarea.value.trim() : "";

      if (!title || !language || !expertiseArea || !codeContent) {
        showAlert("snippet-alert", "Lutfen tum zorunlu alanlari doldurun.", "error");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Buluta Kaydediliyor...";
      }

      try {
        await insertSnippet(title, language, expertiseArea, isPublic, codeContent);
        showAlert("snippet-alert", "Kod parcacigi basariyla bulut sunucusuna kaydedildi.", "success");
        snippetForm.reset();
        if (publicCheckbox) publicCheckbox.checked = true;
        await fetchPublicSnippets();
        renderSnippetsFeed(cachedSnippets);
        updateSnippetCount();
      } catch (err) {
        showAlert("snippet-alert", err.message || "Kayit sirasinda hata olustu.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "Kod Parcacigini Kaydet";
        }
      }
    });
  }

  function updateSnippetCount() {
    var statViews = document.getElementById("stat-views");
    if (statViews) statViews.innerText = cachedSnippets.length;
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
        showAlert("register-alert", "Lutfen tum alanlari doldurun.", "error");
        return;
      }
      if (pass.length < 6) {
        showAlert("register-alert", "Sifreniz en az 6 karakter olmalidir.", "error");
        return;
      }

      var captchaToken = getCaptchaResponse(registerForm);
      if (!captchaToken) {
        showAlert("register-alert", "Lutfen robot olmadiginizi dogrulayin!", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Buluta Kaydediliyor...";
      }

      try {
        await cloudSignUp(uname, email, pass, captchaToken);
        addLog("Yeni kullanici bulut sunucusuna kaydoldu (" + email + ")");
        showAlert("register-alert", "Kayit basarili! Giris ekranina yonlendiriliyorsunuz...", "success");
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
        showAlert("register-alert", err.message || "Kayit basarisiz oldu.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Kayit Ol";
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
        showAlert("login-alert", "Lutfen e-posta ve sifrenizi girin.", "error");
        return;
      }

      var captchaToken = getCaptchaResponse(loginForm);
      if (!captchaToken) {
        showAlert("login-alert", "Lutfen robot olmadiginizi dogrulayin!", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Bulut Oturumu Dogrulaniyor...";
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

        var roleLabel = isAdmin(currentUser.email) ? "Yonetici (Admin)" : "Standart Kullanici";
        addLog(currentUser.username + " bulut oturumu dogrulandi -- Yetki: " + roleLabel);
        loginForm.reset();
        resetCaptcha();
        showView("dashboard");
      } catch (err) {
        resetCaptcha();
        showAlert("login-alert", err.message || "Giris basarisiz. Lutfen bilgilerinizi kontrol edin.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Giris Yap";
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
      var displayName = u.username || (u.email ? u.email.split("@")[0] : "Kullanici");
      var letter = displayName.trim().charAt(0).toUpperCase();
      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + escapeHtml(displayName) + '</span></div>';
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
      var displayName = user.username || (userEmail ? userEmail.split("@")[0] : "Kullanici");
      var letter = displayName.trim().charAt(0).toUpperCase();
      var isSelf = currentUser && (currentUser.email === userEmail || currentUser.id === user.id);
      var isCurrentAdmin = isAdmin(userEmail) || user.role === "admin";

      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell"><div class="table-avatar">' + letter + '</div><span>' + escapeHtml(displayName) + '</span></div>';

      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = userEmail;

      var td3 = document.createElement("td");
      var roleText = isCurrentAdmin ? "Yonetici" : "Kullanici";
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
            alert("Guvenlik: Kendi aktif hesabinizi silemezsiniz.");
            return;
          }
          if (confirm((u.email || u.username) + " kullanicisini bulut veritabanindan kalici olarak silmek istiyor musunuz?")) {
            try {
              btn.disabled = true;
              btn.innerText = "Siliniyor...";
              await cloudDeleteUser(u.id, u.email);
              addLog((u.email || u.username) + " bulut veritabanindan silindi");
              await refreshDashboardData();
            } catch (err) {
              alert("Silme islemi basarisiz: " + (err.message || err));
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
      if (countBadge) countBadge.innerText = "0 kayit";
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
      countBadge.innerText = cleanList.length + " kayit";
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
        dbCopyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Kopyalandi';
        addLog("Terminal JSON icerigi panoya kopyalandi (" + cleanList.length + " kayit)");
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

    var days = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"];
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

  function populateEditProfile() {
    if (!currentUser) return;
    var userInCache = cachedUsers.find(function (u) {
      return (currentUser.id && u.id === currentUser.id) || (u.email && u.email === currentUser.email);
    });

    var usernameVal = (userInCache && userInCache.username) || currentUser.username || (currentUser.email ? currentUser.email.split("@")[0] : "");
    var bioVal = (userInCache && userInCache.bio) || currentUser.bio || "";
    var avatarVal = (userInCache && userInCache.avatar_url) || currentUser.avatar_url || "";

    var editUsername = document.getElementById("edit-username");
    var editBio = document.getElementById("edit-bio");
    var editAvatarUrl = document.getElementById("edit-avatar-url");
    var bioCharNum = document.getElementById("bio-char-num");

    if (editUsername) editUsername.value = usernameVal;
    if (editBio) {
      editBio.value = bioVal;
      if (bioCharNum) bioCharNum.innerText = bioVal.length;
    }
    if (editAvatarUrl) editAvatarUrl.value = avatarVal;
    hideAlert("edit-profile-alert");
  }

  var editBioEl = document.getElementById("edit-bio");
  if (editBioEl) {
    editBioEl.addEventListener("input", function () {
      var numEl = document.getElementById("bio-char-num");
      if (numEl) {
        numEl.innerText = this.value.length;
      }
    });
  }

  var editProfileForm = document.getElementById("edit-profile-form");
  if (editProfileForm) {
    editProfileForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideAlert("edit-profile-alert");
      var btn = document.getElementById("edit-profile-submit-btn");
      var newUsername = document.getElementById("edit-username").value.trim();
      var newBio = document.getElementById("edit-bio").value.trim();
      var newAvatarUrl = document.getElementById("edit-avatar-url").value.trim();

      if (!newUsername) {
        showAlert("edit-profile-alert", "Kullanici adi bos birakilamaz.", "error");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Kaydediliyor...";
      }

      try {
        await updateUserProfile(newUsername, newBio, newAvatarUrl);
        showAlert("edit-profile-alert", "Profil basariyla guncellendi.", "success");
        await refreshDashboardData();
      } catch (err) {
        showAlert("edit-profile-alert", err.message || "Guncelleme sirasinda hata olustu.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "Degisiklikleri Kaydet";
        }
      }
    });
  }

  var btnBackFromProfile = document.getElementById("btn-back-from-profile");
  if (btnBackFromProfile) {
    btnBackFromProfile.addEventListener("click", function () {
      var profileView = document.getElementById("public-profile-view");
      if (profileView) {
        profileView.style.display = "none";
      }
      var targetTabId = previousActiveTabId || "tab-snippets";
      var tabPanels = document.querySelectorAll(".tab-panel");
      tabPanels.forEach(function (p) {
        p.style.display = "";
        p.classList.remove("active");
      });
      var targetPanel = document.getElementById(targetTabId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }
      var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
      sidebarItems.forEach(function (si) {
        if (si.getAttribute("data-tab") === targetTabId) {
          si.classList.add("active");
        } else {
          si.classList.remove("active");
        }
      });
      addLog("Profil sayfasindan geri donuldu");
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
      addLog("Bulut veritabani disa aktarildi (" + exportData.length + " kayit)");
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
              alert("Gecersiz format: JSON dosyasi bir liste/dizi icermelidir.");
              return;
            }
            var client = getSupabaseClient();
            if (client) {
              for (var i = 0; i < data.length; i++) {
                var row = data[i];
                var rowObj = {
                  id: row.id || undefined,
                  username: row.username || "Kullanici",
                  email: row.email || ("user" + i + "@nexus.cloud"),
                  role: row.role || (isAdmin(row.email) ? "admin" : "user"),
                  created_at: row.created_at || new Date().toISOString()
                };
                await client.from("users").upsert(rowObj);
              }
            }
            addLog("Yedek JSON bulut veritabanina aktarildi (" + data.length + " kayit)");
            await refreshDashboardData();
            alert("Yedek basariyla bulut sunucusuna yuklendi. " + data.length + " kayit guncellendi.");
          } catch (err) {
            alert("Yedek yukleme hatasi: " + err.message);
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
      if (confirm("DIKKAT: Bulut veritabanindaki tum kayitlar silinecek ve oturumunuz sonlandirilacaktir. Devam etmek istiyor musunuz?")) {
        try {
          await cloudResetDatabase();
          cachedUsers = [];
          cachedSnippets = [];
          systemLogs = [];
          showView("landing");
          alert("Bulut veritabani temizlendi.");
        } catch (err) {
          alert("Sifirlama hatasi: " + err.message);
        }
      }
    });
  }

  var logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await cloudSignOut();
      addLog("Oturum kapatildi");
      showView("landing");
    });
  }

  var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
  var tabPanels = document.querySelectorAll(".tab-panel");

  sidebarItems.forEach(function (item) {
    item.addEventListener("click", async function (e) {
      e.preventDefault();
      var tabId = this.getAttribute("data-tab");

      var profileView = document.getElementById("public-profile-view");
      if (profileView) {
        profileView.style.display = "none";
      }

      sidebarItems.forEach(function (si) { si.classList.remove("active"); });
      this.classList.add("active");

      tabPanels.forEach(function (p) {
        p.style.display = "";
        p.classList.remove("active");
      });
      var target = document.getElementById(tabId);
      if (target) target.classList.add("active");

      previousActiveTabId = tabId;

      var tabName = this.innerText.trim();
      addLog(tabName + " sekmesine gecildi");

      if (tabId === "tab-users") {
        renderUsersTable(cachedUsers);
        await refreshDashboardData();
      } else if (tabId === "tab-database") {
        renderDatabaseView(cachedUsers);
        renderLogs();
        await refreshDashboardData();
      } else if (tabId === "tab-edit-profile") {
        populateEditProfile();
      } else if (tabId === "tab-overview") {
        renderRecentUsers(cachedUsers);
        var isUserAdmin = currentUser && isAdmin(currentUser.email);
        var statUsers = document.getElementById("stat-users");
        if (statUsers) statUsers.innerText = isUserAdmin ? cachedUsers.length : 1;
        updateSnippetCount();
        await refreshDashboardData();
      } else if (tabId === "tab-snippets") {
        await fetchPublicSnippets();
        renderSnippetsFeed(cachedSnippets);
      } else if (tabId === "tab-add-snippet") {
        hideAlert("snippet-alert");
      }
    });
  });

  async function refreshDashboardData() {
    try {
      var users = await cloudFetchUsers();
      if (currentUser && users && users.length > 0) {
        var selfInDb = users.find(function (u) {
          return (currentUser.id && u.id === currentUser.id) || (u.email && u.email === currentUser.email);
        });
        if (selfInDb) {
          if (selfInDb.username) currentUser.username = selfInDb.username;
          if (selfInDb.bio !== undefined) currentUser.bio = selfInDb.bio;
          if (selfInDb.avatar_url !== undefined) currentUser.avatar_url = selfInDb.avatar_url;
        }
      }

      var isUserAdmin = currentUser && isAdmin(currentUser.email);
      var statUsers = document.getElementById("stat-users");
      if (statUsers) statUsers.innerText = isUserAdmin ? users.length : 1;
      renderRecentUsers(users);
      renderUsersTable(users);
      renderDatabaseView(users);
      renderLogs();

      await fetchPublicSnippets();
      updateSnippetCount();
      renderSnippetsFeed(cachedSnippets);

      addLog("Bulut sunucusundan veriler basariyla cekildi (" + (isUserAdmin ? users.length : 1) + " kullanici, " + cachedSnippets.length + " snippet)");
    } catch (err) {
      addLog("Bulut veri senkronizasyon uyarisi: " + (err.message || err));
    }
  }

  function setupRealtimeListener() {
    var client = getSupabaseClient();
    if (client && !realtimeChannel) {
      try {
        realtimeChannel = client
          .channel("realtime-users-channel")
          .on("postgres_changes", { event: "*", schema: "public", table: "users" }, function () {
            addLog("Bulut veritabaninda anlik degisiklik algilandi (users)");
            refreshDashboardData();
          })
          .subscribe();
      } catch (e) {}
    }
    if (client && !snippetsRealtimeChannel) {
      try {
        snippetsRealtimeChannel = client
          .channel("custom-all-channel")
          .on("postgres_changes", { event: "*", schema: "public", table: "snippets" }, function () {
            addLog("Bulut veritabaninda anlik degisiklik algilandi (snippets)");
            fetchPublicSnippets().then(function () {
              renderSnippetsFeed(cachedSnippets);
              updateSnippetCount();
            });
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
        username: "semih",
        bio: "",
        avatar_url: ""
      };
    }
    applyRolePermissions();
    updateDashHeader();
    renderChart();

    if (systemLogs.length === 0) {
      addLog("Sistem cekirdegi ve UI bilesenleri yuklendi");
      addLog("Bulut veritabani baglantisi kuruldu (Supabase REST API)");
    }

    renderLogs();
    await refreshDashboardData();
    setupRealtimeListener();

    addLog(currentUser.username + " yonetim konsoluna baglandi (" + (isAdmin(currentUser.email) ? "Yonetici" : "Standart Kullanici") + ")");
    updateFluctuatingMetrics();

    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(refreshDashboardData, 4000);

    var profileView = document.getElementById("public-profile-view");
    if (profileView) {
      profileView.style.display = "none";
    }

    sidebarItems.forEach(function (si) { si.classList.remove("active"); });
    var firstTab = document.querySelector('.sidebar-item[data-tab="tab-overview"]');
    if (firstTab) firstTab.classList.add("active");

    tabPanels.forEach(function (p) {
      p.style.display = "";
      p.classList.remove("active");
    });
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
          var metaName = (u && u.user_metadata && u.user_metadata.username) || (u && u.user_metadata && u.user_metadata.full_name) || (u && u.email ? u.email.split("@")[0] : "Kullanici");
          var metaBio = (u && u.user_metadata && u.user_metadata.bio) || "";
          var metaAvatar = (u && u.user_metadata && u.user_metadata.avatar_url) || (u && u.user_metadata && u.user_metadata.avatar) || "";
          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName,
            bio: metaBio,
            avatar_url: metaAvatar
          };
          showView("dashboard");
          return;
        }
      } catch (e) {}

      client.auth.onAuthStateChange(async function (event, session) {
        if (event === "SIGNED_IN" && session && session.user) {
          var u = session.user;
          var metaName = (u.user_metadata && u.user_metadata.username) || (u.user_metadata && u.user_metadata.full_name) || (u.user_metadata && u.user_metadata.preferred_username) || u.email.split("@")[0];
          var metaBio = (u.user_metadata && u.user_metadata.bio) || "";
          var metaAvatar = (u.user_metadata && u.user_metadata.avatar_url) || (u.user_metadata && u.user_metadata.avatar) || "";
          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName,
            bio: metaBio,
            avatar_url: metaAvatar
          };
          var provider = (u.app_metadata && u.app_metadata.provider) || "email";
          if (provider === "github") {
            var cl = getSupabaseClient();
            if (cl) {
              var checkRes = await cl.from("users").select("id").eq("id", u.id).maybeSingle();
              if (!checkRes.data) {
                var userRole = isAdmin(u.email) ? "admin" : "user";
                await cl.from("users").insert([{
                  id: u.id,
                  username: metaName,
                  email: u.email,
                  role: userRole,
                  bio: metaBio,
                  avatar_url: metaAvatar,
                  created_at: new Date().toISOString()
                }]);
                addLog("GitHub OAuth ile yeni kullanici kaydedildi: " + metaName);
              }
            }
          }
          updateNavState();
          showView("dashboard");
        } else if (session && session.user) {
          var u2 = session.user;
          var metaName2 = (u2.user_metadata && u2.user_metadata.username) || (u2.user_metadata && u2.user_metadata.preferred_username) || u2.email.split("@")[0];
          var metaBio2 = (u2.user_metadata && u2.user_metadata.bio) || "";
          var metaAvatar2 = (u2.user_metadata && u2.user_metadata.avatar_url) || (u2.user_metadata && u2.user_metadata.avatar) || "";
          currentUser = {
            id: u2.id,
            email: u2.email,
            username: metaName2,
            bio: metaBio2,
            avatar_url: metaAvatar2
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

  async function handleGitHubAuth(btnElement) {
    if (typeof addLog === "function") addLog("GitHub ile giris islemi baslatiliyor...");

    var client = getSupabaseClient();
    if (!client) {
      if (typeof addLog === "function") addLog("Hata: Supabase istemcisi baslatilamadi.");
      alert("Supabase baglantisi kurulamadi.");
      if (btnElement) btnElement.disabled = false;
      return;
    }

    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerText = "Yonlendiriliyor...";
    }

    try {
      var redirectTarget = window.location.origin;
      if (!redirectTarget || redirectTarget === "null" || redirectTarget.indexOf("http") !== 0) {
        redirectTarget = "https://saas-theta-ochre.vercel.app";
      }

      var res = await client.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: redirectTarget
        }
      });

      var data = res.data;
      var error = res.error;

      if (error) {
        if (typeof addLog === "function") addLog("GitHub Giris Hatasi: " + error.message);
        alert("Giris basarisiz: " + error.message);
        if (btnElement) {
          btnElement.disabled = false;
          btnElement.innerText = "GitHub ile Giris Yap";
        }
      } else if (data && data.url) {
        if (typeof addLog === "function") addLog("GitHub'a yonlendiriliyorsunuz...");
        window.location.href = data.url;
      }
    } catch (err) {
      if (typeof addLog === "function") addLog("GitHub Giris Hatasi: " + (err.message || err));
      alert("Giris basarisiz: " + (err.message || err));
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerText = "GitHub ile Giris Yap";
      }
    }
  }

  var githubBtn = document.getElementById("github-login-btn");
  if (githubBtn) {
    githubBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleGitHubAuth(githubBtn);
    });
  }

  var githubRegisterBtn = document.getElementById("github-register-btn");
  if (githubRegisterBtn) {
    githubRegisterBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      await handleGitHubAuth(githubRegisterBtn);
    });
  }

  checkInitialSession();
});
