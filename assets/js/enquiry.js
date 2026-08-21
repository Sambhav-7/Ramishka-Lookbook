(function () {
  "use strict";

  // Filled in once the Supabase project is provisioned — see README.md.
  var SUPABASE_URL = "__SUPABASE_URL__";
  var SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

  var form = document.getElementById("enquiry-form");
  if (!form) return;

  var statusEl = document.getElementById("enquiry-status");
  var submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }

  function isConfigured() {
    return (
      SUPABASE_URL.indexOf("__") !== 0 &&
      SUPABASE_ANON_KEY.indexOf("__") !== 0
    );
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Honeypot — bots fill every field, real visitors never see this one.
    if (form.querySelector('[name="company_website"]').value) {
      setStatus("Thank you — we'll be in touch shortly.", "success");
      form.reset();
      return;
    }

    var data = {
      name: form.name.value.trim(),
      business: form.business.value.trim() || null,
      email: form.email.value.trim(),
      phone: form.phone.value.trim() || null,
      enquiry_type: form.enquiry_type.value || null,
      message: form.message.value.trim() || null,
    };

    if (!data.name || !data.email) {
      setStatus("Please fill in your name and email.", "error");
      return;
    }

    if (!isConfigured()) {
      setStatus(
        "Enquiries are not available at the moment yet — please reach us directly at labelramishka@gmail.com or call us at 9772395000 in the meantime.",
        "error"
      );
      return;
    }

    submitBtn.disabled = true;
    setStatus("Sending…");

    try {
      var res = await fetch(SUPABASE_URL + "/rest/v1/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Request failed: " + res.status);

      setStatus("Thank you — we'll be in touch shortly.", "success");
      form.reset();
    } catch (err) {
      setStatus(
        "Something went wrong sending that. Please try again, or email labelramishka@gmail.com directly.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
