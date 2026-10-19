// Login Controller for Stash
(function() {
  function login() {
    var u = (document.getElementById("username").value || "").trim();
    var p = document.getElementById("password").value || "";
    var ret = document.getElementById("returnURL").value || "/";
    var errBox = document.getElementsByClassName("login-error")[0];
    if (errBox) errBox.innerHTML = "";

    if (!u || !p) {
      if (errBox) errBox.innerHTML = (window.localeStrings && window.localeStrings.invalid_credentials) || "用户名或密码错误";
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "login", true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          try {
            localStorage.setItem("stash_current_user", JSON.stringify({ username: u }));
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
    var body = "username=" + encodeURIComponent(u) + "&password=" + encodeURIComponent(p) + "&returnURL=" + encodeURIComponent(ret);
    xhr.send(body);
  }

  window.login = login;
})();
