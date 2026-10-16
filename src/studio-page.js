(function () {
  "use strict";
  window.FontKkuDemo.renderNav("font-studio");
  var params = new URLSearchParams(location.search);
  var url = new URL("./lib/studio/index.html", location.href);
  url.hash = location.hash;
  var options = { studioUrl: url.href };
  ["font", "src", "text"].forEach(function (key) {
    if (params.has(key)) options[key] = params.get(key);
  });
  var status = document.querySelector("[data-studio-load-status]");
  var studio = window.FontKkuStudio.mount(document.querySelector("[data-studio-host]"), options);
  // The site owns navigation; editing, project storage and export belong to the packaged UI.
  window.fontKkuStudio = studio;
  studio.ready.then(function () {
    status.hidden = true;
    return studio.setBoundaries(document.documentElement.dataset.demoBoundaries === "on");
  }).catch(function () {
    status.textContent = "글꼴 작업실을 열지 못했습니다. 페이지를 새로 고쳐 주세요.";
    status.hidden = false;
  });
  document.addEventListener("change", function (event) {
    if (event.target.matches("[data-demo-boundary-toggle]")) {
      studio.setBoundaries(event.target.checked).catch(function () {
        status.textContent = "경계 표시를 바꾸지 못했습니다. 페이지를 새로 고쳐 주세요.";
        status.hidden = false;
      });
    }
  });
})();
