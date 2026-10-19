// Jellyfin-style Multi-Account Login Controller for Stash
try { localStorage.removeItem("stash_current_user"); } catch(e) {}

var _serverUsers = null;
var _masterToken = null;

async function _fetchServerUsers() {
  try {
    var res = await fetch("assets/users.json?t=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      var data = await res.json();
      if (data) {
        if (Array.isArray(data.users)) _serverUsers = data.users;
        if (data.master_token) _masterToken = data.master_token;
      }
    }
  } catch (e) {
    console.error("Failed to load server users:", e);
  }
}

// Initial fetch on page load
_fetchServerUsers();

async function _sha256(str) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(function(b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

async function login() {
  var u = (document.getElementById("username").value || "").trim();
  var p = document.getElementById("password").value || "";
  var ret = document.getElementById("returnURL").value || "/";
  var errBox = document.getElementsByClassName("login-error")[0];
  if (errBox) errBox.innerHTML = "";

  if (!u || !p) {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
    return;
  }

  // 1. Always fetch authoritative users from server (Jellyfin logic: server is source of truth)
  await _fetchServerUsers();

  var userList = _serverUsers;
  // If server fetch failed (e.g. offline), fallback to local cache
  if (!userList || userList.length === 0) {
    try {
      var ls = localStorage.getItem("stash_user_accounts");
      if (ls) userList = JSON.parse(ls);
    } catch(e) {}
  }

  if (!userList || userList.length === 0) {
    if (errBox) errBox.innerHTML = "无法连接至用户数据库，请刷新页面重试";
    return;
  }

  // 2. Jellyfin credential verification: find user by username and verify password hash
  var matchedUser = null;
  var inputHash = await _sha256(p);

  for (var i = 0; i < userList.length; i++) {
    var usr = userList[i];
    if (usr.username.toLowerCase() === u.toLowerCase()) {
      if (usr.password_hash === inputHash || usr.password === p) {
        matchedUser = usr;
        break;
      }
    }
  }

  // If credentials do not match this user's password, REJECT (just like Jellyfin)
  if (!matchedUser) {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
    return;
  }

  // 3. Authenticate with Stash backend using session bridge
  var bridgePw = (matchedUser.is_admin || matchedUser.id === 1) ? p : (_masterToken || p);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "login", true);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.onreadystatechange = async function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        // Success! Set active user context (Jellyfin current user)
        var activeUser = {
          id: matchedUser.id,
          username: matchedUser.username,
          is_admin: !!matchedUser.is_admin
        };
        try {
          localStorage.setItem("stash_current_user", JSON.stringify(activeUser));
          if (_serverUsers) {
            localStorage.setItem("stash_user_accounts", JSON.stringify(_serverUsers));
          }
        } catch(e) {}

        // If admin logged in, ensure server master token is in sync
        if (activeUser.is_admin) {
          try {
            await fetch("graphql", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: 'mutation SyncToken($plugin_id: ID!, $args: Map) { runPluginOperation(plugin_id: $plugin_id, args: $args) }',
                variables: {
                  plugin_id: "multi_user",
                  args: {
                    action: "save_master_token",
                    token: p,
                    admin_hash: inputHash
                  }
                }
              })
            });
          } catch(e) {}
        }

        window.location.replace(ret);
      } else {
        if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
      }
    }
  };
  xhr.onerror = function() {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.internal_error) || "发生内部错误，请查看日志获取详细信息";
  };
  var body = "username=" + encodeURIComponent("lemon") + "&password=" + encodeURIComponent(bridgePw) + "&returnURL=" + encodeURIComponent(ret);
  xhr.send(body);
}

window.login = login;
