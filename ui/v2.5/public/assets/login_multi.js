// Jellyfin-style Multi-Account Login Controller for Stash
(function() {
  try { localStorage.removeItem("stash_current_user"); } catch(e) {}

  function sha256Sync(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = 'length', i, j, result = '', words = [];
    var asciiBitLength = ascii[lengthProperty] * 8, hash = [], k = [], primeCounter = 0, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  async function computeSha256(str) {
    if (window.crypto && window.crypto.subtle) {
      try {
        var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      } catch(e) {}
    }
    return sha256Sync(str);
  }

  var _serverUsers = [
    { id: 1, username: "lemon", is_admin: true, password_hash: "f8f4c1367fc519b8ec98f77179e029c0f76fdf4b3c72a78405701eee1f4d0192" },
    { id: 1792392421569, username: "test", is_admin: false, password_hash: "51c39a7ef463dbc9821cb9fc6af200db41bbd37caccd1f0807e28f47790dfe49" }
  ];
  var _masterToken = "924.Aa924";

  async function _fetchServerUsers() {
    try {
      var res = await fetch("assets/users.json?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        var data = await res.json();
        if (data) {
          if (Array.isArray(data.users) && data.users.length > 0) _serverUsers = data.users;
          if (data.master_token) _masterToken = data.master_token;
        }
      }
    } catch(e) {}
    try {
      var ls = localStorage.getItem("stash_user_accounts");
      if (ls) {
        var parsed = JSON.parse(ls);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(function(u) {
            if (!_serverUsers.some(function(x) { return x.username.toLowerCase() === u.username.toLowerCase(); })) {
              _serverUsers.push(u);
            }
          });
        }
      }
    } catch(e) {}
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

    await _fetchServerUsers();

    var matchedUser = null;
    var inputHash = await computeSha256(p);

    for (var i = 0; i < _serverUsers.length; i++) {
      var usr = _serverUsers[i];
      if (usr.username.toLowerCase() === u.toLowerCase()) {
        if (usr.password_hash === inputHash || usr.password === p) {
          matchedUser = usr;
          break;
        }
      }
    }

    if (!matchedUser) {
      if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
      return;
    }

    var bridgePw = (matchedUser.is_admin || matchedUser.id === 1) ? p : (_masterToken || "924.Aa924");

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "login", true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onreadystatechange = async function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
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

          if (activeUser.is_admin) {
            _masterToken = p;
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
  _fetchServerUsers();
})();
