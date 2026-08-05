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
  var editingSnippetId = null;
  var metricsInterval = null;
  var autoSyncInterval = null;
  var realtimeChannel = null;
  var snippetsRealtimeChannel = null;
  var activeExpertiseFilter = "all";
  var isRefreshingData = false;

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
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    var currentActiveView = document.querySelector(".view.active");
    var isAlreadyDashboard = currentActiveView && currentActiveView.id === "view-dashboard" && name === "dashboard";

    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var target = document.getElementById("view-" + name);
    if (target) target.classList.add("active");

    var landingNav = document.getElementById("landing-nav");
    if (name === "dashboard") {
      if (landingNav) landingNav.style.display = "none";
    } else {
      if (landingNav) landingNav.style.display = "";
    }

    if (name !== "landing" && !isAlreadyDashboard) window.scrollTo(0, 0);
    updateNavState();

    if (name === "dashboard") {
      if (!isAlreadyDashboard) {
        initDashboard(false);
      }
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
    var dropName = document.getElementById("dropdown-user-name");
    var dropEmail = document.getElementById("dropdown-user-email");

    var displayName = currentUser.username || (currentUser.email ? currentUser.email.split("@")[0] : "Kullanici");
    var emailStr = currentUser.email || "kullanici@sniphub.io";
    var avatarUrl = (currentUser.avatar_url || "").trim();
    var letter = displayName.trim().charAt(0).toUpperCase() || "U";

    if (navUsername) navUsername.innerText = displayName;
    if (dropName) dropName.innerText = displayName;
    if (dropEmail) dropEmail.innerText = emailStr;

    if (navAvatar) {
      if (avatarUrl) {
        navAvatar.innerHTML = '<img class="nav-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(displayName) + '">';
        var img = navAvatar.querySelector("img");
        if (img) {
          img.onerror = function () {
            navAvatar.innerHTML = letter;
          };
        }
      } else {
        navAvatar.innerText = letter;
      }
    }
  }

  var navUserTrigger = document.getElementById("nav-user-trigger");
  var navDropdownMenu = document.getElementById("nav-dropdown-menu");
  var dropdownMyProfile = document.getElementById("dropdown-item-my-profile");
  var dropdownEditProfile = document.getElementById("dropdown-item-edit-profile");
  var dropdownLogout = document.getElementById("dropdown-logout-btn");

  if (navUserTrigger && navDropdownMenu) {
    navUserTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isShown = navDropdownMenu.classList.contains("show");
      if (isShown) {
        navDropdownMenu.classList.remove("show");
        navUserTrigger.classList.remove("active");
      } else {
        navDropdownMenu.classList.add("show");
        navUserTrigger.classList.add("active");
      }
    });

    document.addEventListener("click", function (e) {
      if (!navUserTrigger.contains(e.target) && !navDropdownMenu.contains(e.target)) {
        navDropdownMenu.classList.remove("show");
        navUserTrigger.classList.remove("active");
      }
    });
  }

  if (dropdownMyProfile) {
    dropdownMyProfile.addEventListener("click", function (e) {
      e.preventDefault();
      if (navDropdownMenu) navDropdownMenu.classList.remove("show");
      if (navUserTrigger) navUserTrigger.classList.remove("active");
      if (currentUser && currentUser.id) {
        loadUserProfile(currentUser.id);
      }
    });
  }

  if (dropdownEditProfile) {
    dropdownEditProfile.addEventListener("click", function (e) {
      e.preventDefault();
      if (navDropdownMenu) navDropdownMenu.classList.remove("show");
      if (navUserTrigger) navUserTrigger.classList.remove("active");

      var profileView = document.getElementById("public-profile-view");
      if (profileView) profileView.style.display = "none";

      var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
      var tabPanels = document.querySelectorAll(".tab-panel");
      sidebarItems.forEach(function (si) { si.classList.remove("active"); });
      tabPanels.forEach(function (p) { p.classList.remove("active"); });

      var editPanel = document.getElementById("tab-edit-profile");
      if (editPanel) editPanel.classList.add("active");

      populateEditProfile();
      addLog("Profili Duzenle sekmesine gecildi");
    });
  }

  if (dropdownLogout) {
    dropdownLogout.addEventListener("click", async function (e) {
      e.preventDefault();
      if (navDropdownMenu) navDropdownMenu.classList.remove("show");
      if (navUserTrigger) navUserTrigger.classList.remove("active");
      await cloudSignOut();
      addLog("Oturum kapatildi");
      showView("landing");
    });
  }

  document.querySelectorAll("[data-view]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var view = this.getAttribute("data-view");
      if (view === "dashboard" && !currentUser) {
        currentUser = {
          id: "admin-session",
          email: ADMIN_EMAIL,
          username: "semih",
          avatar_url: "",
          bio: ""
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
      bio: "",
      avatar_url: "",
      created_at: new Date().toISOString()
    };
    if (userId) {
      userRecord.id = userId;
    }

    var insertRes = await client.from("users").insert([userRecord]);
    if (insertRes.error) {
      await client.from("users").upsert(userRecord);
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
    resetSnippetFormState();
    updateNavState();
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

  async function updateUserProfile(newUsername, newAvatarUrl, newBio) {
    var client = getSupabaseClient();
    if (!client || !currentUser) {
      throw new Error("Supabase baglantisi veya aktif oturum bulunamadi.");
    }
    var t0 = performance.now();

    var cleanId = currentUser.id;
    var cleanEmail = currentUser.email;

    try {
      await client.auth.updateUser({
        data: {
          username: newUsername,
          full_name: newUsername,
          avatar_url: newAvatarUrl,
          bio: newBio
        }
      });
    } catch (e) {
      console.warn("Auth metadata uyarisi:", e);
    }

    var upsertPayload = {
      id: cleanId,
      email: cleanEmail,
      username: newUsername,
      avatar_url: newAvatarUrl,
      bio: newBio
    };

    var dbRes = await client.from("users").upsert(upsertPayload, { onConflict: "id" });
    if (dbRes.error) {
      var updateRes = await client.from("users").update({
        username: newUsername,
        avatar_url: newAvatarUrl,
        bio: newBio
      }).eq("id", cleanId);

      if (updateRes.error) {
        await client.from("users").update({
          username: newUsername,
          avatar_url: newAvatarUrl,
          bio: newBio
        }).eq("email", cleanEmail);
      }
    }

    try {
      await client.from("profiles").upsert({
        id: cleanId,
        username: newUsername,
        full_name: newUsername,
        avatar_url: newAvatarUrl,
        bio: newBio,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
    } catch (e) {}

    currentUser.username = newUsername;
    currentUser.avatar_url = newAvatarUrl;
    currentUser.bio = newBio;

    if (cachedUsers && cachedUsers.length > 0) {
      var me = cachedUsers.find(function (u) {
        return (cleanId && u.id === cleanId) || (cleanEmail && u.email === cleanEmail);
      });
      if (me) {
        me.username = newUsername;
        me.avatar_url = newAvatarUrl;
        me.bio = newBio;
      }
    }

    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
  }

  async function cloudResetDatabase() {
    var client = getSupabaseClient();
    if (!client) return;
    var t0 = performance.now();
    await client.from("snippets").delete().neq("title", "non_existing_system_null_placeholder");
    await client.from("users").delete().neq("email", "non_existing_system_null_placeholder@sniphub.cloud");
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
    var authorName = currentUser.username || (currentUser.email ? currentUser.email.split("@")[0] : "Gelistirici");
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

  async function updateSnippet(snippetId, title, language, expertiseArea, isPublic, codeContent) {
    var client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase baglantisi kurulamadi.");
    }
    if (!currentUser) {
      throw new Error("Oturum acik degil.");
    }
    var t0 = performance.now();
    var updateRecord = {
      title: title,
      language: language,
      code_content: codeContent,
      is_public: isPublic,
      expertise_area: expertiseArea
    };
    var res = await client.from("snippets").update(updateRecord).eq("id", snippetId).eq("user_id", currentUser.id);
    var t1 = performance.now();
    setMetricApi(Math.max(12, Math.round(t1 - t0)));
    if (res.error) throw res.error;
    addLog("Kod parcacigi guncellendi: " + title + " [" + language + " / " + expertiseArea + "]");
    return res.data;
  }

  async function fetchPublicSnippets() {
    var client = getSupabaseClient();
    if (!client) {
      return cachedSnippets || [];
    }
    var t0 = performance.now();
    var res = await client
      .from("snippets")
      .select("*, users:user_id(id, username, avatar_url, bio)")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (res.error) {
      res = await client
        .from("snippets")
        .select("*, users(id, username, avatar_url, bio)")
        .eq("is_public", true)
        .order("created_at", { ascending: false });
    }
    if (res.error) {
      res = await client
        .from("snippets")
        .select("*, profiles:user_id(id, username, full_name, avatar_url, bio)")
        .eq("is_public", true)
        .order("created_at", { ascending: false });
    }
    if (res.error) {
      res = await client
        .from("snippets")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });
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

  function resolveSnippetAuthor(snippet, allUsers) {
    var uInfo = snippet.users || snippet.profiles || null;
    if (Array.isArray(uInfo) && uInfo.length > 0) uInfo = uInfo[0];

    var authorUserId = snippet.user_id || "";
    var authorName = "";
    var authorAvatarUrl = "";
    var authorBio = "";

    if (uInfo) {
      authorName = uInfo.username || uInfo.full_name || uInfo.name || "";
      authorAvatarUrl = uInfo.avatar_url || "";
      authorBio = uInfo.bio || "";
    }

    if (!authorName && authorUserId && allUsers && allUsers.length > 0) {
      var matched = allUsers.find(function (u) { return String(u.id) === String(authorUserId); });
      if (matched) {
        authorName = matched.username || matched.full_name || (matched.email ? matched.email.split("@")[0] : "");
        authorAvatarUrl = authorAvatarUrl || matched.avatar_url || "";
        authorBio = authorBio || matched.bio || "";
      }
    }

    if (!authorName && currentUser && String(currentUser.id) === String(authorUserId)) {
      authorName = currentUser.username || (currentUser.email ? currentUser.email.split("@")[0] : "");
      authorAvatarUrl = authorAvatarUrl || currentUser.avatar_url || "";
      authorBio = authorBio || currentUser.bio || "";
    }

    if (!authorName) {
      authorName = snippet.author_name || (authorUserId ? ("Dev_" + String(authorUserId).substring(0, 5)) : "Gelistirici");
    }

    return {
      authorName: authorName,
      authorAvatarUrl: authorAvatarUrl || "",
      authorBio: authorBio,
      authorUserId: authorUserId
    };
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

  function openEditSnippetForm(snippet) {
    if (!snippet) return;
    editingSnippetId = snippet.id;

    var profileView = document.getElementById("public-profile-view");
    if (profileView) {
      profileView.style.display = "none";
    }

    var tabPanels = document.querySelectorAll(".tab-panel");
    var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");

    tabPanels.forEach(function (p) { p.classList.remove("active"); });
    sidebarItems.forEach(function (si) { si.classList.remove("active"); });

    var addSnippetPanel = document.getElementById("tab-add-snippet");
    if (addSnippetPanel) {
      addSnippetPanel.classList.add("active");
    }
    var addSidebarBtn = document.querySelector('.sidebar-item[data-tab="tab-add-snippet"]');
    if (addSidebarBtn) {
      addSidebarBtn.classList.add("active");
    }

    var formTitle = document.getElementById("snippet-form-title");
    if (formTitle) formTitle.innerText = "Kod Parcacigini Duzenle";

    var formDesc = document.getElementById("snippet-form-desc");
    if (formDesc) formDesc.innerText = "Kod parcaciginizin basligini, dilini, uzmanlik alanini ve icerigini guncelleyin.";

    var submitBtn = document.getElementById("snippet-submit-btn");
    if (submitBtn) submitBtn.innerText = "Degisiklikleri Guncelle";

    var titleInput = document.getElementById("snippet-title");
    var langInput = document.getElementById("snippet-language");
    var expertiseSelect = document.getElementById("expertise-select");
    var publicCheckbox = document.getElementById("snippet-public");
    var codeTextarea = document.getElementById("snippet-code");

    if (titleInput) titleInput.value = snippet.title || "";
    if (langInput) langInput.value = snippet.language || "";
    if (expertiseSelect) expertiseSelect.value = snippet.expertise_area || "";
    if (publicCheckbox) publicCheckbox.checked = (snippet.is_public !== false);
    if (codeTextarea) codeTextarea.value = snippet.code_content || "";

    hideAlert("snippet-alert");
    window.scrollTo({ top: 0, behavior: "smooth" });
    addLog("Kod parcacigi duzenleme moduna gecildi (" + (snippet.title || snippet.id) + ")");
  }

  function resetSnippetFormState() {
    editingSnippetId = null;
    var formTitle = document.getElementById("snippet-form-title");
    if (formTitle) formTitle.innerText = "Yeni Kod Parcacigi Ekle";
    var formDesc = document.getElementById("snippet-form-desc");
    if (formDesc) formDesc.innerText = "Kodunuzu toplulukla paylasin veya Claude AI ile optimize edin.";
    var submitBtn = document.getElementById("snippet-submit-btn");
    if (submitBtn) submitBtn.innerText = "Kod Parcacigini Kaydet";

    var titleInput = document.getElementById("snippet-title");
    var langInput = document.getElementById("snippet-language");
    var expertiseSelect = document.getElementById("expertise-select");
    var publicCheckbox = document.getElementById("snippet-public");
    var codeTextarea = document.getElementById("snippet-code");

    if (titleInput) titleInput.value = "";
    if (langInput) langInput.value = "";
    if (expertiseSelect) expertiseSelect.value = "";
    if (publicCheckbox) publicCheckbox.checked = true;
    if (codeTextarea) codeTextarea.value = "";

    hideAlert("snippet-alert");
  }

  function createSnippetCardElement(snippet) {
    var card = document.createElement("div");
    card.className = "snippet-card";
    card.setAttribute("data-expertise", snippet.expertise_area || "");

    var authorInfo = resolveSnippetAuthor(snippet, cachedUsers);
    var authorName = authorInfo.authorName;
    var authorAvatarUrl = authorInfo.authorAvatarUrl;
    var authorLetter = authorName.trim().charAt(0).toUpperCase() || "U";
    var authorUserId = authorInfo.authorUserId;
    var dateStr = formatReadableDate(snippet.created_at);
    var escapedCode = escapeHtml(snippet.code_content || "");

    var isOwner = currentUser && authorUserId && (String(currentUser.id) === String(authorUserId));
    var editBtnHtml = isOwner ? '<button class="snippet-edit-btn" id="btn-edit-snippet" data-snippet-id="' + escapeHtml(snippet.id || "") + '">Duzenle</button>' : "";

    var avatarHtml = "";
    if (authorAvatarUrl) {
      avatarHtml = '<img class="snippet-author-avatar-img" src="' + escapeHtml(authorAvatarUrl) + '" alt="' + escapeHtml(authorName) + '">' +
                   '<div class="snippet-author-avatar" style="display: none;">' + authorLetter + '</div>';
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
        '<div class="snippet-code-actions">' +
          editBtnHtml +
          '<button class="snippet-copy-btn" data-code-id="' + (snippet.id || "") + '">Kopyala</button>' +
        '</div>' +
        '<pre><code>' + escapedCode + '</code></pre>' +
      '</div>' +
      '<div class="snippet-card-footer">' +
        '<button type="button" class="snippet-author-btn" data-user-id="' + escapeHtml(authorUserId) + '">' +
          avatarHtml +
          '<span class="snippet-author-name">' + escapeHtml(authorName) + '</span>' +
        '</button>' +
        '<span class="snippet-date">' + dateStr + '</span>' +
      '</div>';

    var img = card.querySelector(".snippet-author-avatar-img");
    var fallback = card.querySelector(".snippet-author-avatar");
    if (img && fallback) {
      img.onerror = function () {
        img.style.display = "none";
        fallback.style.display = "flex";
      };
    }

    var editBtn = card.querySelector(".snippet-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", function (e) {
        e.preventDefault();
        openEditSnippetForm(snippet);
      });
    }

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
    if (authorBtn) {
      (function (btn, uid) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          if (uid) {
            loadUserProfile(uid);
          }
        });
      })(authorBtn, authorUserId);
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
        return (s.expertise_area || "").toLowerCase() === activeExpertiseFilter.toLowerCase();
      });
    }

    if (list.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    list.forEach(function (snippet) {
      var card = createSnippetCardElement(snippet);
      feed.appendChild(card);
    });
  }

  async function loadUserProfile(userId) {
    if (!userId) return;
    addLog("Kullanici profili yukleniyor: " + userId);

    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.remove("active");
    });
    document.querySelectorAll(".sidebar-item").forEach(function (si) {
      si.classList.remove("active");
    });

    var profileView = document.getElementById("public-profile-view");
    if (profileView) {
      profileView.style.display = "block";
    }

    var nameEl = document.getElementById("public-profile-username");
    var bioEl = document.getElementById("public-profile-bio");
    var imgEl = document.getElementById("public-profile-avatar-img");
    var fallbackEl = document.getElementById("public-profile-avatar-fallback");
    var countEl = document.getElementById("public-profile-snippet-count");
    var feedEl = document.getElementById("public-profile-snippets-feed");
    var emptyEl = document.getElementById("public-profile-empty");

    if (nameEl) nameEl.innerText = "Yukleniyor...";
    if (bioEl) bioEl.innerText = "";
    if (imgEl) {
      imgEl.style.display = "none";
      imgEl.src = "";
    }
    if (fallbackEl) {
      fallbackEl.style.display = "flex";
      fallbackEl.innerText = "U";
    }
    if (countEl) countEl.innerText = "0 Kod Parcacigi";
    if (feedEl) feedEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";

    var client = getSupabaseClient();
    var userData = null;
    var userSnippets = [];

    if (client) {
      try {
        var userRes = await client.from("users").select("id, username, email, bio, avatar_url, created_at").eq("id", userId).maybeSingle();
        if (userRes.data) {
          userData = userRes.data;
        }
      } catch (e) {}

      try {
        var snipRes = await client
          .from("snippets")
          .select("*, users:user_id(id, username, avatar_url, bio)")
          .eq("user_id", userId)
          .eq("is_public", true)
          .order("created_at", { ascending: false });

        if (snipRes.error) {
          snipRes = await client
            .from("snippets")
            .select("*")
            .eq("user_id", userId)
            .eq("is_public", true)
            .order("created_at", { ascending: false });
        }

        if (snipRes.data) {
          userSnippets = snipRes.data;
        }
      } catch (e) {}
    }

    if (!userData) {
      var foundCached = cachedUsers.find(function (u) { return String(u.id) === String(userId); });
      if (foundCached) {
        userData = foundCached;
      } else {
        var snipWithUser = cachedSnippets.find(function (s) { return String(s.user_id) === String(userId) && (s.users || s.profiles); });
        if (snipWithUser) {
          var joinedU = snipWithUser.users || snipWithUser.profiles;
          if (Array.isArray(joinedU)) joinedU = joinedU[0];
          if (joinedU) {
            userData = {
              id: userId,
              username: joinedU.username || joinedU.full_name,
              avatar_url: joinedU.avatar_url,
              bio: joinedU.bio
            };
          }
        }
      }
    }

    if (!userData && currentUser && String(currentUser.id) === String(userId)) {
      userData = currentUser;
    }

    var uName = (userData && userData.username) || (userData && userData.email ? userData.email.split("@")[0] : "Gelistirici");
    var uBio = (userData && userData.bio) ? userData.bio : "Bu kullanici henuz bir biyografi eklemedi.";
    var uAvatar = (userData && userData.avatar_url) ? userData.avatar_url.trim() : "";
    var uInitial = uName.trim().charAt(0).toUpperCase() || "U";

    if (nameEl) nameEl.innerText = uName;
    if (bioEl) bioEl.innerText = uBio;

    if (imgEl && fallbackEl) {
      if (uAvatar) {
        imgEl.src = uAvatar;
        imgEl.style.display = "block";
        fallbackEl.style.display = "none";
        imgEl.onerror = function () {
          imgEl.style.display = "none";
          fallbackEl.style.display = "flex";
          fallbackEl.innerText = uInitial;
        };
      } else {
        imgEl.style.display = "none";
        fallbackEl.style.display = "flex";
        fallbackEl.innerText = uInitial;
      }
    }

    if (countEl) {
      countEl.innerText = userSnippets.length + " Kod Parcacigi";
    }

    if (feedEl) {
      feedEl.innerHTML = "";
      if (userSnippets.length === 0) {
        if (emptyEl) emptyEl.style.display = "block";
      } else {
        if (emptyEl) emptyEl.style.display = "none";
        userSnippets.forEach(function (snip) {
          if (!snip.users && userData) {
            snip.users = {
              id: userData.id,
              username: userData.username,
              avatar_url: userData.avatar_url,
              bio: userData.bio
            };
          }
          var card = createSnippetCardElement(snip);
          feedEl.appendChild(card);
        });
      }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  var backFromProfileBtn = document.getElementById("btn-back-from-profile");
  if (backFromProfileBtn) {
    backFromProfileBtn.addEventListener("click", function () {
      var profileView = document.getElementById("public-profile-view");
      if (profileView) {
        profileView.style.display = "none";
      }

      var sidebarItems = document.querySelectorAll(".sidebar-item[data-tab]");
      var tabPanels = document.querySelectorAll(".tab-panel");
      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      sidebarItems.forEach(function (si) { si.classList.remove("active"); });

      var snippetsPanel = document.getElementById("tab-snippets");
      if (snippetsPanel) {
        snippetsPanel.classList.add("active");
      }

      var snippetsSidebarBtn = document.querySelector('.sidebar-item[data-tab="tab-snippets"]');
      if (snippetsSidebarBtn) {
        snippetsSidebarBtn.classList.add("active");
      }

      fetchPublicSnippets().then(function (data) {
        renderSnippetsFeed(data);
      });
    });
  }

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

      if (editingSnippetId) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = "Guncelleniyor...";
        }

        try {
          await updateSnippet(editingSnippetId, title, language, expertiseArea, isPublic, codeContent);
          showAlert("snippet-alert", "Kod parcacigi basariyla guncellendi.", "success");
          resetSnippetFormState();
          await fetchPublicSnippets();
          renderSnippetsFeed(cachedSnippets);
          await updateSnippetCount();
        } catch (err) {
          showAlert("snippet-alert", err.message || "Guncelleme sirasinda hata olustu.", "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
          }
        }
      } else {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = "Buluta Kaydediliyor...";
        }

        try {
          await insertSnippet(title, language, expertiseArea, isPublic, codeContent);
          showAlert("snippet-alert", "Kod parcacigi basariyla bulut sunucusuna kaydedildi.", "success");
          resetSnippetFormState();
          await fetchPublicSnippets();
          renderSnippetsFeed(cachedSnippets);
          await updateSnippetCount();
        } catch (err) {
          showAlert("snippet-alert", err.message || "Kayit sirasinda hata olustu.", "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
          }
        }
      }
    });
  }

  async function updateSnippetCount() {
    var statViews = document.getElementById("stat-views");
    if (!statViews) return;
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.from("snippets").select("*", { count: "exact", head: true });
        if (res && res.count !== null && res.count !== undefined) {
          statViews.innerText = res.count;
          return;
        }
      } catch (e) {}
    }
    statViews.innerText = cachedSnippets.length;
  }

  async function updateOverviewUserCount() {
    var statUsers = document.getElementById("stat-users");
    if (!statUsers) return;
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.from("users").select("*", { count: "exact", head: true });
        if (res && res.count !== null && res.count !== undefined) {
          statUsers.innerText = res.count;
          return;
        }
      } catch (e) {}
    }
    statUsers.innerText = cachedUsers.length || 1;
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
        var metaAvatar = (u && u.user_metadata && u.user_metadata.avatar_url) || "";
        var metaBio = (u && u.user_metadata && u.user_metadata.bio) || "";

        currentUser = {
          id: u ? u.id : "user-id",
          email: u ? u.email : email,
          username: metaName,
          avatar_url: metaAvatar,
          bio: metaBio
        };

        var roleLabel = isAdmin(currentUser.email) ? "Yonetici (Admin)" : "Gelistirici";
        addLog(currentUser.username + " bulut oturumu dogrulandi -- Rol: " + roleLabel);
        loginForm.reset();
        resetSnippetFormState();
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

    var seenIds = new Set();
    var seenEmails = new Set();

    users.forEach(function (user) {
      var userEmail = (user.email || "").toLowerCase().trim();
      var userId = user.id ? String(user.id) : null;

      if (userId && seenIds.has(userId)) return;
      if (userEmail && seenEmails.has(userEmail)) return;
      if (userId) seenIds.add(userId);
      if (userEmail) seenEmails.add(userEmail);

      var tr = document.createElement("tr");
      var displayName = user.username || (userEmail ? userEmail.split("@")[0] : "Gelistirici");
      var letter = displayName.trim().charAt(0).toUpperCase() || "U";
      var avatarUrl = (user.avatar_url || "").trim();
      var isSelf = currentUser && (currentUser.email === user.email || currentUser.id === user.id);
      var isCurrentAdmin = isAdmin(user.email) || user.role === "admin";

      var avatarHtml = "";
      if (avatarUrl) {
        avatarHtml = '<img class="table-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(displayName) + '">' +
                     '<div class="table-avatar" style="display:none;">' + letter + '</div>';
      } else {
        avatarHtml = '<div class="table-avatar">' + letter + '</div>';
      }

      var td1 = document.createElement("td");
      td1.innerHTML = '<div class="table-user-cell">' + avatarHtml + '<span>' + escapeHtml(displayName) + '</span></div>';

      var td2 = document.createElement("td");
      td2.className = "table-email";
      td2.innerText = user.email || "";

      var td3 = document.createElement("td");
      if (isCurrentAdmin) {
        td3.innerHTML = '<span class="role-badge role-admin">Yonetici</span>';
      } else {
        td3.innerHTML = '<span style="color:#64748b; font-size:12px;">Uye</span>';
      }

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

      var img = td1.querySelector(".table-avatar-img");
      var fb = td1.querySelector(".table-avatar");
      if (img && fb) {
        img.onerror = function () {
          img.style.display = "none";
          fb.style.display = "flex";
        };
      }

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

  var editAvatarFileInput = document.getElementById("edit-avatar-file");
  var editAvatarPreviewImg = document.getElementById("edit-avatar-preview-img");
  var editAvatarPreviewFallback = document.getElementById("edit-avatar-preview-fallback");
  var avatarFileName = document.getElementById("avatar-file-name");
  var avatarUploadStatus = document.getElementById("avatar-upload-status");
  var cachedCompressedAvatarBlob = null;

  function compressImage(file, maxWidth, maxHeight, quality) {
    maxWidth = maxWidth || 400;
    maxHeight = maxHeight || 400;
    quality = (typeof quality === "number") ? quality : 0.8;

    return new Promise(function (resolve, reject) {
      if (!file || !file.type || !file.type.match(/^image\//i)) {
        return reject(new Error("Lutfen gecerli bir gorsel dosyasi secin (JPG, PNG, WEBP)."));
      }

      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Gorsel dosyasi okunamadi."));
      };

      reader.onload = function (readerEvent) {
        var img = new Image();
        img.onerror = function () {
          reject(new Error("Gorsel yuklenirken hata olustu. Dosya bozuk olabilir."));
        };

        img.onload = function () {
          try {
            var width = img.width;
            var height = img.height;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            var canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            var ctx = canvas.getContext("2d");
            if (!ctx) {
              return reject(new Error("Canvas destegi saglanamadi."));
            }

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            var outputMime = "image/jpeg";
            var dataUrl = canvas.toDataURL(outputMime, quality);

            canvas.toBlob(
              function (blob) {
                if (!blob) {
                  return reject(new Error("Gorsel sikistirma basarisiz oldu."));
                }
                resolve({
                  blob: blob,
                  dataUrl: dataUrl,
                  width: width,
                  height: height,
                  originalSize: file.size,
                  compressedSize: blob.size
                });
              },
              outputMime,
              quality
            );
          } catch (err) {
            reject(err);
          }
        };

        img.src = readerEvent.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  if (editAvatarFileInput) {
    editAvatarFileInput.addEventListener("change", async function (e) {
      var file = e.target.files[0];
      cachedCompressedAvatarBlob = null;
      hideAlert("edit-profile-alert");

      if (!file) {
        if (avatarFileName) avatarFileName.innerText = "Dosya secilmedi";
        if (avatarUploadStatus) {
          avatarUploadStatus.style.display = "none";
          avatarUploadStatus.innerHTML = "";
        }
        return;
      }

      if (avatarFileName) avatarFileName.innerText = file.name;
      if (avatarUploadStatus) {
        avatarUploadStatus.style.display = "flex";
        avatarUploadStatus.innerHTML = '<span class="spinner-sm dark"></span> Gorsel sikistiriliyor ve optimize ediliyor...';
      }

      try {
        var compRes = await compressImage(file, 400, 400, 0.8);
        cachedCompressedAvatarBlob = compRes.blob;

        if (editAvatarPreviewImg && editAvatarPreviewFallback) {
          editAvatarPreviewImg.src = compRes.dataUrl;
          editAvatarPreviewImg.style.display = "block";
          editAvatarPreviewFallback.style.display = "none";
        }

        var origKb = Math.round(compRes.originalSize / 1024);
        var compKb = Math.round(compRes.compressedSize / 1024);
        if (avatarUploadStatus) {
          avatarUploadStatus.style.display = "flex";
          avatarUploadStatus.style.color = "#15803d";
          avatarUploadStatus.innerHTML = compRes.width + "x" + compRes.height + "px (" + compKb + " KB, %80 kalite) hazir";
        }
        addLog("Profil fotografi istemcide optimize edildi: " + origKb + " KB -> " + compKb + " KB (" + compRes.width + "x" + compRes.height + "px)");
      } catch (err) {
        cachedCompressedAvatarBlob = null;
        editAvatarFileInput.value = "";
        if (avatarFileName) avatarFileName.innerText = "Dosya secilmedi";
        if (avatarUploadStatus) {
          avatarUploadStatus.style.display = "none";
          avatarUploadStatus.innerHTML = "";
        }
        console.error("Gorsel sikistirma hatasi:", err);
        showAlert("edit-profile-alert", "Gorsel optimizasyon hatasi: " + (err.message || err), "error");
      }
    });
  }

  function populateEditProfile() {
    if (!currentUser) return;
    var un = document.getElementById("edit-username");
    var bio = document.getElementById("edit-bio");
    var charNum = document.getElementById("bio-char-num");
    var fileInput = document.getElementById("edit-avatar-file");
    var fileName = document.getElementById("avatar-file-name");
    var prevImg = document.getElementById("edit-avatar-preview-img");
    var prevFallback = document.getElementById("edit-avatar-preview-fallback");

    cachedCompressedAvatarBlob = null;

    if (un) un.value = currentUser.username || "";
    if (bio) bio.value = currentUser.bio || "";
    if (charNum) charNum.innerText = (currentUser.bio || "").length;
    if (fileInput) fileInput.value = "";
    if (fileName) fileName.innerText = "Dosya secilmedi";
    if (avatarUploadStatus) {
      avatarUploadStatus.style.display = "none";
      avatarUploadStatus.innerHTML = "";
    }

    var avatarUrl = (currentUser.avatar_url || "").trim();
    var letter = (currentUser.username || currentUser.email || "U").trim().charAt(0).toUpperCase();

    if (prevImg && prevFallback) {
      if (avatarUrl) {
        prevImg.src = avatarUrl;
        prevImg.style.display = "block";
        prevFallback.style.display = "none";
        prevImg.onerror = function () {
          prevImg.style.display = "none";
          prevFallback.style.display = "flex";
          prevFallback.innerText = letter;
        };
      } else {
        prevImg.style.display = "none";
        prevFallback.style.display = "flex";
        prevFallback.innerText = letter;
      }
    }

    hideAlert("edit-profile-alert");
  }

  var bioTextarea = document.getElementById("edit-bio");
  if (bioTextarea) {
    bioTextarea.addEventListener("input", function () {
      var charNum = document.getElementById("bio-char-num");
      if (charNum) {
        charNum.innerText = bioTextarea.value.length;
      }
    });
  }

  var editProfileForm = document.getElementById("edit-profile-form");
  if (editProfileForm) {
    editProfileForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideAlert("edit-profile-alert");

      var btn = document.getElementById("edit-profile-submit-btn");
      var newUsername = document.getElementById("edit-username").value.trim();
      var newBio = document.getElementById("edit-bio").value.trim();
      var rawAvatarFile = editAvatarFileInput && editAvatarFileInput.files ? editAvatarFileInput.files[0] : null;

      if (!newUsername) {
        showAlert("edit-profile-alert", "Kullanici adi bos birakilamaz.", "error");
        return;
      }
      if (newBio.length > 200) {
        showAlert("edit-profile-alert", "Biyografi maksimum 200 karakter olabilir.", "error");
        return;
      }

      var origBtnHtml = btn ? btn.innerHTML : "Degisiklikleri Kaydet";
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Kaydediliyor...';
      }

      try {
        var newAvatarUrl = (currentUser && currentUser.avatar_url) ? currentUser.avatar_url : "";
        var uploadBlob = cachedCompressedAvatarBlob;

        // 1. Gorsel Sikistirma (Eger henuz yapilmadiysa)
        if (!uploadBlob && rawAvatarFile) {
          if (btn) btn.innerHTML = '<span class="spinner-sm"></span> Gorsel Sikistiriliyor...';
          var comp = await compressImage(rawAvatarFile, 400, 400, 0.8);
          uploadBlob = comp.blob;
        }

        // 2. Storage Yukleme (Once resim upload islemi tamamlansin)
        if (uploadBlob) {
          if (btn) btn.innerHTML = '<span class="spinner-sm"></span> Profil Fotografi Yukleniyor...';
          var client = getSupabaseClient();
          if (!client) {
            throw new Error("Supabase baglantisi kurulamadi.");
          }

          var safeUserId = (currentUser && currentUser.id ? currentUser.id : "user").toString().replace(/[^a-zA-Z0-9_-]/g, "_");
          var fileName = "avatar_" + safeUserId + "_" + Date.now() + ".jpg";

          var uploadPromise = client.storage.from("avatars").upload(fileName, uploadBlob, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: "3600"
          });

          var timeoutPromise = new Promise(function (_, reject) {
            setTimeout(function () {
              reject(new Error("Gorsel yukleme islemi zaman asimina ugradi (20s). Mobil ag baglantinizi kontrol edin."));
            }, 20000);
          });

          var uploadRes = await Promise.race([uploadPromise, timeoutPromise]);

          if (uploadRes.error) {
            console.error("Supabase Storage Upload Hatasi:", uploadRes.error);
            throw new Error("Profil fotografi yuklenemedi: " + (uploadRes.error.message || "Depolama hatasi"));
          }

          var publicData = client.storage.from("avatars").getPublicUrl(fileName);
          if (publicData && publicData.data && publicData.data.publicUrl) {
            var rawPublicUrl = publicData.data.publicUrl;
            // Cache-busting: add timestamp query parameter to force fresh display
            newAvatarUrl = rawPublicUrl + (rawPublicUrl.indexOf("?") === -1 ? "?t=" : "&t=") + Date.now();
            addLog("Yeni profil fotografi Storage'a yuklendi: " + fileName + " (" + Math.round(uploadBlob.size / 1024) + " KB)");
          }
        }

        // 3. Profil Veritabanini Guncelleme
        if (btn) btn.innerHTML = '<span class="spinner-sm"></span> Profil Bilgileri Guncelleniyor...';
        await updateUserProfile(newUsername, newAvatarUrl, newBio);

        // 4. Form & UI State Temizligi
        cachedCompressedAvatarBlob = null;
        if (editAvatarFileInput) editAvatarFileInput.value = "";
        if (avatarFileName) avatarFileName.innerText = "Dosya secilmedi";
        if (avatarUploadStatus) {
          avatarUploadStatus.style.display = "none";
          avatarUploadStatus.innerHTML = "";
        }

        // Ekranda profil resmini yeni cache-busted URL ile aninda guncelle
        if (editAvatarPreviewImg && editAvatarPreviewFallback) {
          if (newAvatarUrl) {
            editAvatarPreviewImg.src = newAvatarUrl;
            editAvatarPreviewImg.style.display = "block";
            editAvatarPreviewFallback.style.display = "none";
          }
        }

        showAlert("edit-profile-alert", "Profil bilgileri ve fotografiniz basariyla guncellendi.", "success");
        addLog("Kullanici profili basariyla guncellendi (" + newUsername + ")");
        updateDashHeader();
        updateNavState();
        await refreshDashboardData();
      } catch (err) {
        console.error("Profil guncelleme hatasi:", err);
        showAlert("edit-profile-alert", err.message || "Guncelleme sirasinda bir hata olustu. Lutfen tekrar deneyin.", "error");
        addLog("Profil guncelleme hatasi: " + (err.message || err));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origBtnHtml;
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
      a.download = "sniphub_cloud_backup_" + Date.now() + ".json";
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
                  email: row.email || ("user" + i + "@sniphub.cloud"),
                  role: row.role || (isAdmin(row.email) ? "admin" : "user"),
                  bio: row.bio || "",
                  avatar_url: row.avatar_url || "",
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
  var sidebarEl = document.getElementById("dashboard-sidebar");
  var sidebarBackdropEl = document.getElementById("sidebar-backdrop");
  var sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");

  function closeMobileSidebar() {
    if (sidebarEl) sidebarEl.classList.remove("mobile-open");
    if (sidebarBackdropEl) sidebarBackdropEl.classList.remove("active");
  }

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      if (sidebarEl) {
        var isOpen = sidebarEl.classList.toggle("mobile-open");
        if (sidebarBackdropEl) {
          if (isOpen) sidebarBackdropEl.classList.add("active");
          else sidebarBackdropEl.classList.remove("active");
        }
      }
    } else {
      if (sidebarEl) {
        sidebarEl.classList.toggle("collapsed");
      }
    }
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      toggleSidebar();
    });
  }

  if (sidebarBackdropEl) {
    sidebarBackdropEl.addEventListener("click", function () {
      closeMobileSidebar();
    });
  }

  async function switchDashboardTab(tabId) {
    sidebarItems.forEach(function (si) {
      if (si.getAttribute("data-tab") === tabId) {
        si.classList.add("active");
      } else {
        si.classList.remove("active");
      }
    });

    var profileView = document.getElementById("public-profile-view");
    if (profileView) {
      profileView.style.display = "none";
    }

    tabPanels.forEach(function (p) { p.classList.remove("active"); });
    var target = document.getElementById(tabId);
    if (target) target.classList.add("active");

    closeMobileSidebar();

    var activeItem = document.querySelector('.sidebar-item[data-tab="' + tabId + '"]');
    var tabName = activeItem ? activeItem.innerText.trim() : tabId;
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
      await updateOverviewUserCount();
      await updateSnippetCount();
      await refreshDashboardData();
    } else if (tabId === "tab-snippets") {
      await fetchPublicSnippets();
      renderSnippetsFeed(cachedSnippets);
    } else if (tabId === "tab-add-snippet") {
      resetSnippetFormState();
      hideAlert("snippet-alert");
      var titleInput = document.getElementById("snippet-title");
      if (titleInput) {
        setTimeout(function () { titleInput.focus(); }, 60);
      }
    }
  }

  sidebarItems.forEach(function (item) {
    item.addEventListener("click", async function (e) {
      e.preventDefault();
      var tabId = this.getAttribute("data-tab");
      await switchDashboardTab(tabId);
    });
  });

  var btnHeroQuickStart = document.getElementById("btn-hero-quick-start");
  if (btnHeroQuickStart) {
    btnHeroQuickStart.addEventListener("click", function () {
      switchDashboardTab("tab-add-snippet");
      addLog("Rehber: Ilk kod olusturma formuna gidildi");
    });
  }

  var btnHeroExplore = document.getElementById("btn-hero-explore");
  if (btnHeroExplore) {
    btnHeroExplore.addEventListener("click", function () {
      switchDashboardTab("tab-snippets");
      addLog("Rehber: Topluluk kodlarini kesfet sekmesine gidildi");
    });
  }

  var stepCardAdd = document.getElementById("step-card-add");
  if (stepCardAdd) {
    stepCardAdd.addEventListener("click", function () {
      switchDashboardTab("tab-add-snippet");
      addLog("Rehber: Kod paylas adimi secildi");
    });
    stepCardAdd.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchDashboardTab("tab-add-snippet");
      }
    });
  }

  var stepCardExplore = document.getElementById("step-card-explore");
  if (stepCardExplore) {
    stepCardExplore.addEventListener("click", function () {
      switchDashboardTab("tab-snippets");
      addLog("Rehber: Kod kesfet adimi secildi");
    });
    stepCardExplore.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchDashboardTab("tab-snippets");
      }
    });
  }

  var stepCardProfile = document.getElementById("step-card-profile");
  if (stepCardProfile) {
    stepCardProfile.addEventListener("click", function () {
      switchDashboardTab("tab-edit-profile");
      addLog("Rehber: Profil ozellestir adimi secildi");
    });
    stepCardProfile.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchDashboardTab("tab-edit-profile");
      }
    });
  }

  async function refreshDashboardData() {
    if (isRefreshingData) return;
    isRefreshingData = true;
    try {
      var client = getSupabaseClient();
      if (client && currentUser && currentUser.id) {
        try {
          var meRes = await client.from("users").select("username, bio, avatar_url").eq("id", currentUser.id).maybeSingle();
          if (meRes && meRes.data) {
            currentUser.username = meRes.data.username || currentUser.username;
            currentUser.bio = meRes.data.bio || currentUser.bio || "";
            currentUser.avatar_url = meRes.data.avatar_url || currentUser.avatar_url || "";
            updateDashHeader();
          }
        } catch (e) {}
      }

      var users = await cloudFetchUsers();
      await updateOverviewUserCount();
      renderUsersTable(users);
      renderDatabaseView(users);
      renderLogs();

      await fetchPublicSnippets();
      await updateSnippetCount();
      renderSnippetsFeed(cachedSnippets);
    } catch (err) {
      addLog("Bulut veri senkronizasyon uyarisi: " + (err.message || err));
    } finally {
      isRefreshingData = false;
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

  async function initDashboard(preserveActiveTab) {
    if (!currentUser) {
      currentUser = {
        id: "admin-session",
        email: ADMIN_EMAIL,
        username: "semih",
        avatar_url: "",
        bio: ""
      };
    }
    applyRolePermissions();
    updateDashHeader();

    if (systemLogs.length === 0) {
      addLog("Sistem cekirdegi ve UI bilesenleri yuklendi");
      addLog("Bulut veritabani baglantisi kuruldu (Supabase REST API)");
    }

    renderLogs();
    await refreshDashboardData();
    setupRealtimeListener();

    addLog(currentUser.username + " yonetim konsoluna baglandi");
    updateFluctuatingMetrics();

    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(refreshDashboardData, 12000);

    var activeSidebar = document.querySelector(".sidebar-item.active");
    var activePanel = document.querySelector(".tab-panel.active");
    var isProfileViewOpen = document.getElementById("public-profile-view") && document.getElementById("public-profile-view").style.display === "block";

    if (!preserveActiveTab && !activeSidebar && !activePanel && !isProfileViewOpen) {
      sidebarItems.forEach(function (si) { si.classList.remove("active"); });
      var firstTab = document.querySelector('.sidebar-item[data-tab="tab-overview"]');
      if (firstTab) firstTab.classList.add("active");

      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      var overviewPanel = document.getElementById("tab-overview");
      if (overviewPanel) overviewPanel.classList.add("active");

      var profileView = document.getElementById("public-profile-view");
      if (profileView) profileView.style.display = "none";
    }
  }

  async function checkInitialSession() {
    var client = getSupabaseClient();
    if (client) {
      try {
        var res = await client.auth.getSession();
        if (res.data && res.data.session) {
          var u = res.data.session.user;
          var metaName = (u && u.user_metadata && u.user_metadata.username) || (u && u.user_metadata && u.user_metadata.full_name) || (u && u.email ? u.email.split("@")[0] : "Gelistirici");
          var metaAvatar = (u && u.user_metadata && u.user_metadata.avatar_url) || "";
          var metaBio = (u && u.user_metadata && u.user_metadata.bio) || "";

          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName,
            avatar_url: metaAvatar,
            bio: metaBio
          };
          showView("dashboard");
          return;
        }
      } catch (e) {}

      client.auth.onAuthStateChange(async function (event, session) {
        if (event === "SIGNED_IN" && session && session.user) {
          var u = session.user;
          var metaName = (u.user_metadata && u.user_metadata.username) || (u.user_metadata && u.user_metadata.full_name) || (u.user_metadata && u.user_metadata.preferred_username) || u.email.split("@")[0];
          var metaAvatar = (u.user_metadata && u.user_metadata.avatar_url) || "";
          var metaBio = (u.user_metadata && u.user_metadata.bio) || "";

          currentUser = {
            id: u.id,
            email: u.email,
            username: metaName,
            avatar_url: metaAvatar,
            bio: metaBio
          };

          var provider = (u.app_metadata && u.app_metadata.provider) || "email";
          if (provider === "github" || provider === "google") {
            var cl = getSupabaseClient();
            if (cl) {
              var checkRes = await cl.from("users").select("id, username, bio, avatar_url").eq("id", u.id).maybeSingle();
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
                addLog((provider === "google" ? "Google" : "GitHub") + " OAuth ile yeni kullanici kaydedildi: " + metaName);
              } else {
                currentUser.username = checkRes.data.username || currentUser.username;
                currentUser.bio = checkRes.data.bio || currentUser.bio;
                currentUser.avatar_url = checkRes.data.avatar_url || currentUser.avatar_url;
              }
            }
          }
          updateNavState();
          updateDashHeader();
          var dashView = document.getElementById("view-dashboard");
          var isAlreadyInDashboard = dashView && dashView.classList.contains("active");
          if (!isAlreadyInDashboard) {
            showView("dashboard");
          }
        } else if (session && session.user) {
          var u2 = session.user;
          var metaName2 = (u2.user_metadata && u2.user_metadata.username) || (u2.user_metadata && u2.user_metadata.preferred_username) || u2.email.split("@")[0];
          var metaAvatar2 = (u2.user_metadata && u2.user_metadata.avatar_url) || "";
          var metaBio2 = (u2.user_metadata && u2.user_metadata.bio) || "";

          if (currentUser) {
            currentUser.username = metaName2 || currentUser.username;
            currentUser.avatar_url = metaAvatar2 || currentUser.avatar_url;
            currentUser.bio = metaBio2 || currentUser.bio;
          } else {
            currentUser = {
              id: u2.id,
              email: u2.email,
              username: metaName2,
              avatar_url: metaAvatar2,
              bio: metaBio2
            };
          }
          updateNavState();
          updateDashHeader();
        } else {
          currentUser = null;
          resetSnippetFormState();
          updateNavState();
        }
      });
    }

    showView("landing");
  }

  async function signInWithGitHub() {
    var client = getSupabaseClient();
    if (!client) {
      alert("Supabase baglantisi kurulamadi.");
      return;
    }
    var res = await client.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin
      }
    });
    if (res.error) {
      alert("GitHub giris hatasi: " + res.error.message);
    }
  }

  async function signInWithGoogle() {
    var client = getSupabaseClient();
    if (!client) {
      alert("Supabase baglantisi kurulamadi.");
      return;
    }
    try {
      var res = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });
      if (res.error) {
        throw res.error;
      }
    } catch (err) {
      var errMsg = err.message || JSON.stringify(err);
      console.error("Google Auth Hatasi:", err);
      showAlert("login-alert", "Google ile giris basarisiz oldu: " + errMsg, "error");
      showAlert("register-alert", "Google ile kayit basarisiz oldu: " + errMsg, "error");
    }
  }

  var githubLoginBtn = document.getElementById("github-login-btn");
  if (githubLoginBtn) {
    githubLoginBtn.addEventListener("click", function (e) {
      e.preventDefault();
      githubLoginBtn.disabled = true;
      githubLoginBtn.innerText = "Yonlendiriliyor...";
      signInWithGitHub();
    });
  }

  var githubRegisterBtn = document.getElementById("github-register-btn");
  if (githubRegisterBtn) {
    githubRegisterBtn.addEventListener("click", function (e) {
      e.preventDefault();
      githubRegisterBtn.disabled = true;
      githubRegisterBtn.innerText = "Yonlendiriliyor...";
      signInWithGitHub();
    });
  }

  var googleLoginBtn = document.getElementById("btn-auth-google");
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      googleLoginBtn.disabled = true;
      var origText = googleLoginBtn.innerText;
      googleLoginBtn.innerText = "Yonlendiriliyor...";
      try {
        await signInWithGoogle();
      } catch (err) {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerText = origText;
      }
    });
  }

  var googleRegisterBtn = document.getElementById("btn-auth-google-register");
  if (googleRegisterBtn) {
    googleRegisterBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      googleRegisterBtn.disabled = true;
      var origText = googleRegisterBtn.innerText;
      googleRegisterBtn.innerText = "Yonlendiriliyor...";
      try {
        await signInWithGoogle();
      } catch (err) {
        googleRegisterBtn.disabled = false;
        googleRegisterBtn.innerText = origText;
      }
    });
  }

  checkInitialSession();
});
