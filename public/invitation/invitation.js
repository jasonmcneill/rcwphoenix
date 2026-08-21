(function () {
  "use strict";

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
  });

  function init() {
    setupAccordion();
    setupRsvpLink();
    setupShareButton();
    setupQrButton();
    loadGreeting();
  }

  function setupAccordion() {
    var headers = document.querySelectorAll(".event-header");
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener("click", toggleEvent);
      headers[i].addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleEvent.call(this);
        }
      });
    }
  }

  function toggleEvent() {
    var header = this;
    var panelId = header.getAttribute("aria-controls");
    var panel = document.getElementById(panelId);
    if (!panel) return;

    var expanded = header.getAttribute("aria-expanded") === "true";
    if (expanded) {
      header.blur();
    }
    header.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
    panel.classList.toggle("open", !expanded);
  }

  function setupRsvpLink() {
    var invitedBy = getInvitedBy();
    if (!invitedBy) return;

    var link = document.getElementById("rsvp-link");
    if (!link) return;

    var href = link.getAttribute("href");
    var separator = href.indexOf("?") >= 0 ? "&" : "?";
    link.setAttribute(
      "href",
      href + separator + "invitedby=" + encodeURIComponent(invitedBy),
    );
  }

  function setupShareButton() {
    if (!navigator.share) return;

    var button = document.getElementById("share-button");
    if (!button) return;

    button.hidden = false;
    document.body.classList.add("has-fab");

    button.addEventListener("click", function () {
      navigator
        .share({
          title: document.title,
          text: "Join me at an event of the Phoenix Restored Church Worldwide.",
          url: window.location.href,
        })
        .catch(function () {
          // User cancelled the share sheet or it failed; no action needed.
        });
    });
  }

  function setupQrButton() {
    if (typeof qrcode !== "function") return;

    var button = document.getElementById("qr-button");
    var modal = document.getElementById("qr-modal");
    var backdrop = document.getElementById("qr-modal-backdrop");
    var closeButton = document.getElementById("qr-modal-close");
    var codeContainer = document.getElementById("qr-code-container");
    var urlLabel = document.getElementById("qr-modal-url");
    if (!button || !modal || !backdrop || !closeButton || !codeContainer) {
      return;
    }

    var lastFocused = null;

    function renderQrCode() {
      var url = window.location.href;
      var qr = qrcode(0, "M");

      if (window.location.search === "?utm_source=homescreen") {
        url = window.location.href.replaceAll(window.location.search, "");
      }

      qr.addData(url);
      qr.make();
      codeContainer.innerHTML = qr.createSvgTag({
        scalable: true,
        margin: 16,
      });
      if (urlLabel) urlLabel.textContent = url;
    }

    function onKeydown(e) {
      if (e.key === "Escape") closeModal();
    }

    function openModal() {
      renderQrCode();
      lastFocused = document.activeElement;
      modal.hidden = false;
      document.addEventListener("keydown", onKeydown);
      closeButton.focus();
    }

    function closeModal() {
      modal.hidden = true;
      document.removeEventListener("keydown", onKeydown);
      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
    }

    button.addEventListener("click", openModal);
    closeButton.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);

    button.hidden = false;
    document.body.classList.add("has-fab");
  }

  function loadGreeting() {
    var invitedBy = getInvitedBy();
    if (!invitedBy) return;

    fetch("/api/invitation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invitedby: invitedBy }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Bad response");
        return response.json();
      })
      .then(function (data) {
        if (!data || typeof data.name !== "string" || data.name.length === 0) {
          throw new Error("Missing name");
        }
        renderGreeting(data);
      })
      .catch(function () {
        // Silent failure: keep the page in its default state.
      });
  }

  function getInvitedBy() {
    var params = new URLSearchParams(window.location.search);
    var value = params.get("invitedby");
    if (!value || !/^\d+$/.test(value)) return null;
    var n = parseInt(value, 10);
    return n > 0 ? n : null;
  }

  function renderGreeting(data) {
    var card = document.getElementById("invitedby");
    if (!card) return;

    var greeting = document.createElement("div");
    greeting.className = "greeting";
    greeting.setAttribute("role", "region");
    greeting.setAttribute("aria-label", "Personal invitation");

    if (data.headshotUrl && typeof data.headshotUrl === "string") {
      var img = document.createElement("img");
      img.className = "greeting-headshot mt-1";
      img.src = data.headshotUrl;
      img.alt = "Photo of " + data.name;
      greeting.appendChild(img);
    }

    var text = document.createElement("div");
    text.className = "greeting-text";

    var nameEl = document.createElement("p");
    nameEl.className = "greeting-name wrapBalanced";
    nameEl.textContent = "Invited by " + data.name;
    text.appendChild(nameEl);

    if (data.message && typeof data.message === "string") {
      var msgEl = document.createElement("p");
      msgEl.className = "greeting-message wrapBalanced mt-1 mb-1";
      msgEl.textContent = data.message;
      text.appendChild(msgEl);
    }

    greeting.appendChild(text);

    if (data.youtubeId && typeof data.youtubeId === "string") {
      var video = document.createElement("div");
      video.className = "greeting-video";
      var iframe = document.createElement("iframe");
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(data.youtubeId);
      iframe.title = "Video message from " + data.name;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      video.appendChild(iframe);
      greeting.appendChild(video);
    }

    var logo = card.querySelector(".hero-logo");
    if (logo && logo.nextSibling) {
      card.insertBefore(greeting, logo.nextSibling);
    } else {
      card.insertBefore(greeting, card.firstChild);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        card.removeAttribute("hidden");
        card.scrollIntoView({ behavior: "smooth" });
        greeting.classList.add("show");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
