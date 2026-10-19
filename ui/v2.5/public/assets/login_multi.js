var _uList = [];
var _mToken = "stash_session_master_2026";

function _loadUsers() {
  try {
    fetch("assets/users.json?t=" + Date.now()).then(function(r) {
      return r.json();
    }).then(function(d) {
      if (d && d.users) _uList = d.users;
      if (d && d.master_token) _mToken = d.master_token;
    }).catch(function() {});
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

  // 1. If user list not loaded yet, check localStorage
  if (!_uList || _uList.length === 0) {
    try {
      var ls = localStorage.getItem("stash_user_accounts");
      if (ls) _uList = JSON.parse(ls);
    } catch(e) {}
  }

  // 2. Validate user credentials
  var matched = null;
  var pHash = await _sha256(p);
  for (var i = 0; i < _uList.length; i++) {
    var usr = _uList[i];
    if (usr.username.toLowerCase() === u.toLowerCase()) {
      if (usr.password_hash === pHash || usr.password === p) {
        matched = usr;
        break;
      }
    }
  }

  // If we have registered accounts and no match found, reject
  if (_uList.length > 0 && !matched) {
    if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
    return;
  }

  // 3. Authenticate with backend using master bridge token
  var reqU = "lemon";
  var reqP = _mToken;

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "login", true);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        var active = matched || { id: 1, username: u, is_admin: true };
        try {
          localStorage.setItem("stash_current_user", JSON.stringify({
            id: active.id,
            username: active.username,
            is_admin: !!active.is_admin
          }));
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
  var body = "username=" + encodeURIComponent(reqU) + "&password=" + encodeURIComponent(reqP) + "&returnURL=" + encodeURIComponent(ret);
  xhr.send(body);
}

window.login = login;
