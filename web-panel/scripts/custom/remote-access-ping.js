(() => {
  if (document.documentElement.dataset.wandEnhancerCustomScript === 'loaded') {
    return;
  }

  document.documentElement.dataset.wandEnhancerCustomScript = 'loaded';
  console.info('[Wand Enhancer] Custom renderer script loaded');
})();