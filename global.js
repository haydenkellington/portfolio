console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/haydenkellington', title: 'GitHub' },
];

const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'
    : '/portfolio/';

let nav = document.createElement('nav');
nav.setAttribute('aria-label', 'Main navigation');
document.body.prepend(nav);

for (let page of pages) {
  let url = page.url;
  let title = page.title;

  if (!url.startsWith('http')) {
    url = BASE_PATH + url;
  }

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;

  if (a.host === location.host && a.pathname === location.pathname) {
    a.classList.add('current');
  }

  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  nav.append(a);
}

let themeLabel = document.createElement('label');
themeLabel.className = 'color-scheme';
themeLabel.append('Theme: ');

let themeSelect = document.createElement('select');
themeSelect.setAttribute('aria-label', 'Color scheme');

for (let optionData of [
  { value: 'light dark', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]) {
  let option = document.createElement('option');
  option.value = optionData.value;
  option.textContent = optionData.label;
  themeSelect.append(option);
}

themeLabel.append(themeSelect);
document.body.prepend(themeLabel);

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  themeSelect.value = colorScheme;
}

themeSelect.addEventListener('input', (event) => {
  let colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
});

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

let form = document.querySelector('form');
form?.addEventListener('submit', (event) => {
  event.preventDefault();

  let data = new FormData(form);
  let parameters = [];

  for (let [name, value] of data) {
    parameters.push(`${name}=${encodeURIComponent(value)}`);
  }

  let url = `${form.action}?${parameters.join('&')}`;
  location.href = url;
});
