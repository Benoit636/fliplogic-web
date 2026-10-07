const target = document.getElementById(location.pathname.replace('/', ''));
if (target && location.pathname !== '/privacy') target.scrollIntoView();
