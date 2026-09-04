(function () {
  "use strict";

  var dialog = document.getElementById("rsvp-dialog");
  var form = document.getElementById("rsvp-form");
  var phoneInput = document.getElementById("phone");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");

  // Initialize intl-tel-input (US default) -- same behavior as /contact/
  var iti = window.intlTelInput(phoneInput, {
    initialCountry: "us",
    preferredCountries: ["us", "ca", "mx", "gb"],
    separateDialCode: true,
    utilsScript:
      "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.12/build/js/utils.js",
  });

  // Keep the country dropdown out of the tab order.
  var countryButton = phoneInput
    .closest(".iti")
    .querySelector(".iti__selected-country");
  if (countryButton) countryButton.setAttribute("tabindex", "-1");

  // ---- dialog open/close ----
  function openDialog() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    var first = form.elements["name"];
    if (first)
      setTimeout(function () {
        first.focus();
      }, 50);
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  document
    .querySelectorAll("#rsvp-open, [data-rsvp-open]")
    .forEach(function (btn) {
      btn.addEventListener("click", openDialog);
    });

  document.getElementById("rsvp-close").addEventListener("click", closeDialog);

  // Click outside the dialog panel closes it.
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) closeDialog();
  });

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(name, msg) {
    var input = form.querySelector("[name='" + name + "']");
    var slot = form.querySelector("[data-error-for='" + name + "']");
    if (slot) slot.textContent = msg || "";
    if (input) input.classList.toggle("invalid", !!msg);
  }

  function clearErrors() {
    ["name", "email", "phone", "guests"].forEach(function (n) {
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
    if (phoneVal.length && !iti.isValidNumber()) {
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
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var guests = parseInt(form.elements["guests"].value, 10) || 0;
    var comments = form.elements["comments"].value.trim();
    var partyNote =
      "Inaugural service RSVP (Sep 13, 2026, 10 AM): " +
      (guests === 0
        ? "attending alone (1 total)."
        : "bringing " + guests + " guest(s) (" + (guests + 1) + " total).");

    var payload = {
      name: form.elements["name"].value.trim(),
      email: form.elements["email"].value.toLowerCase().trim(),
      phone: iti.getNumber(), // E.164
      phoneCountry: iti.getSelectedCountryData().iso2,
      interests: ["inaugural service RSVP"],
      guests: guests,
      comments: comments ? partyNote + "\n\n" + comments : partyNote,
    };

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending";

    try {
      var res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      statusEl.textContent =
        "Thanks! Your RSVP is in. We can't wait to see you on September 13.";
      statusEl.classList.add("success");
      form.reset();
      iti.setCountry("us");
    } catch (err) {
      statusEl.textContent =
        "Sorry, something went wrong sending your RSVP. Please try again later.";
      statusEl.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  document.querySelector("#btnWatchInvite").addEventListener("click", (evt) => {
    evt.preventDefault();
    const watch = document.querySelector("#watch");
    if (!watch) return;
    watch.scrollIntoView({ behavior: "smooth" });
  });
})();
