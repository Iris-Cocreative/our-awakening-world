(function() {
    var script = document.currentScript;
    var src = script.getAttribute('data-src') || 'https://theplacebetween.us/';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.cssText = 'width:100%;height:100vh;height:100svh;border:none;display:block;';
    iframe.setAttribute('allowfullscreen', '');
    script.parentNode.insertBefore(iframe, script);
})();
