var _uList = [];
var _mToken = "123Aa123";

async function _loadUsers() {
  try {
    var res = await fetch("assets/users.json?t=" + Date.now());
    var d = await res.json();
    if (d && d.users) _uList = d.users;
    if (d && d.master_token) _mToken = d.master_token;
  } catch(e) {}
}
_loadUsers();

async function _sha256(s) {
  var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(function(x) {
    return x.toString(16).padStart(2, '0');
  }).join('');
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

  // 1. Always load latest users from network or fallback to localStorage
  if (!_uList || _uList.length === 0 || !_mToken) {
    await _loadUsers();
  }

  var userList = [];
  try {
    var ls = localStorage.getItem("stash_user_accounts");
    if (ls) {
      var parsed = JSON.parse(ls);
      if (Array.isArray(parsed)) userList = parsed;
    }
  } catch(e) {}

  if (_uList && _uList.length > 0) {
    for (var i = 0; i < _uList.length; i++) {
      var nu = _uList[i];
      var exists = userList.some(function(x) { return x.username.toLowerCase() === nu.username.toLowerCase(); });
      if (!exists) {
        userList.push(nu);
      }
    }
  }

  // Find user in registered list
  var matched = null;
  var pHash = await _sha256(p);
  for (var i = 0; i < userList.length; i++) {
    var usr = userList[i];
    if (usr.username.toLowerCase() === u.toLowerCase()) {
      if (usr.password_hash === pHash || usr.password === p) {
        matched = usr;
        break;
      }
    }
  }

  var isAdminUser = (u.toLowerCase() === "lemon");

  // CASE 1: Primary Administrator
  if (isAdminUser) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "login", true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onreadystatechange = async function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          try {
            localStorage.setItem("stash_current_user", JSON.stringify({
              id: 1,
              username: "lemon",
              is_admin: true
            }));
          } catch(e) {}

          var pHash = await _sha256(p);
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
                    admin_hash: pHash
                  }
                }
              })
            });
          } catch(e) {}

          window.location.replace(ret);
        } else {
          if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
        }
      }
    };
    xhr.onerror = function() {
      if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.internal_error) || "发生内部错误，请查看日志获取详细信息";
    };
    var body = "username=" + encodeURIComponent("lemon") + "&password=" + encodeURIComponent(p) + "&returnURL=" + encodeURIComponent(ret);
    xhr.send(body);
    return;
  }

  // CASE 2: Member User (e.g. test)
  if (!matched) {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
    return;
  }

  var bridgeToken = _mToken || "123Aa123";

  var xhr2 = new XMLHttpRequest();
  xhr2.open("POST", "login", true);
  xhr2.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr2.onreadystatechange = function() {
    if (xhr2.readyState == 4) {
      if (xhr2.status == 200) {
        try {
          localStorage.setItem("stash_current_user", JSON.stringify({
            id: matched.id,
            username: matched.username,
            is_admin: !!matched.is_admin
          }));
        } catch(e) {}
        window.location.replace(ret);
      } else {
        if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
      }
    }
  };
  xhr2.onerror = function() {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.internal_error) || "发生内部错误，请查看日志获取详细信息";
  };
  var body2 = "username=" + encodeURIComponent("lemon") + "&password=" + encodeURIComponent(bridgeToken) + "&returnURL=" + encodeURIComponent(ret);
  xhr2.send(body2);
}

window.login = login;
