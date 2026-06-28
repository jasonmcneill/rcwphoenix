(function () {
  "use strict";

  var phoneInput = document.getElementById("phone");
  var form = document.getElementById("contact-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");

  // Initialize intl-tel-input (US default)
  var iti = window.intlTelInput(phoneInput, {
    initialCountry: "us",
    preferredCountries: ["us", "ca", "mx", "gb"],
    separateDialCode: true,
    utilsScript:
      "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.12/build/js/utils.js",
  });

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(name, msg) {
    var input = form.querySelector("[name='" + name + "']");
    var slot = form.querySelector("[data-error-for='" + name + "']");
    if (slot) slot.textContent = msg || "";
    if (input) input.classList.toggle("invalid", !!msg);
  }

  function clearErrors() {
    ["name", "email", "phone"].forEach(function (n) {
      setError(n, "");
    });
  }

  function validate() {
    clearErrors();
    var ok = true;

    var name = form.elements["name"].value.trim();
    if (!name) {
      setError("name", "Please enter your name.");
      ok = false;
    }

    var email = form.elements["email"].value.trim();
    if (!email) {
      setError("email", "Please enter your email.");
      ok = false;
    } else if (!EMAIL_RE.test(email)) {
      setError("email", "Please enter a valid email address.");
      ok = false;
    }

    var phoneVal = phoneInput.value.trim();
    if (phoneVal.trim().length && !iti.isValidNumber()) {
      setError("phone", "Please enter a valid phone number.");
      ok = false;
    }

    return ok;
  }

  ["name", "email", "phone"].forEach(function (n) {
    var el = form.querySelector("[name='" + n + "']");
    if (el)
      el.addEventListener("input", function () {
        setError(n, "");
      });
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.className = "form-status";
    if (!validate()) {
      document
        .querySelector("#contact-form")
        .scrollIntoView({ behavior: "smooth" });
      return;
    }

    var interests = Array.prototype.map.call(
      form.querySelectorAll("input[name='interests']:checked"),
      function (cb) {
        return cb.value;
      },
    );

    var payload = {
      name: form.elements["name"].value.trim(),
      email: form.elements["email"].value.toLowerCase().trim(),
      phone: iti.getNumber(), // E.164
      phoneCountry: iti.getSelectedCountryData().iso2,
      interests: interests,
      comments: form.elements["comments"].value.trim(),
    };

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    try {
      var res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      statusEl.textContent =
        "Thanks! We received your message and will be in touch soon.";
      statusEl.classList.add("success");
      form.reset();
      iti.setCountry("us");
    } catch (err) {
      statusEl.textContent =
        "Sorry — something went wrong sending your message. Please try again later.";
      statusEl.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();
