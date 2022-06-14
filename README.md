# Impulse: yes-code UI editor (alpha)

[impulse.dev](https://impulse.dev) | [Discord](https://discord.gg/RbVE8cj9)

TODO: video link

Impulse is a visual UI editor for web apps that use React and Tailwind.

It allows you to edit your UI right in the browser while automatically changing your code precisely the way you would do it manually.

- Built into you app: no need to install any extensions or desktop apps
- No external services, works directly with the code
- Made exclusively for developers, not designers
- Addon, not a replacement: gives you a new tool while not taking anything away

Compared to writing code manually:
- Faster
- More fun
- Same code produced

Features:
- Select any DOM element and jump streight to its code in your editor
- Add new markup visually without leaving the browser
- Make edits to any existing DOM element with all changes saved to code automatically


## Requirements

Rendering libraries:
- ✅ React
- ⬜️ Vue (possibly in the future)
- 🚫 Svelte (no plans for support)
- 🚫 Angular (no plans for support)

React frameworks:
- ✅ Next.js
- ✅ Create React App
- ✅ Vite
- ✅ any custom system built on top of Babel/Webpack/Rollup
- ⬜️ esbuild (TODO link issue)
- ⬜️ Parcel

CSS frameworks:
- ✅ Tailwind
- 🚫 no plans to support other CSS frameworks for now

Browsers:
- ✅ Chromium-based
- 🚫 Firefox
- 🚫 Safari

(Impulse relies on [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) which only works well in Chromium-based browsers)

Editor integration:
- ✅ VS Code
- ⬜️ more coming


## Install

### Try now

Copy and paste the code below into you browser's console.

```js
d=document;s=d.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest/inject.js';d.body.appendChild(s)
```

### <script> tag

TODO: test

Paste this script tag at the end of `<body>`

```jsx
{process.env.NODE_ENV === 'development' && <script src="https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest/inject.js"></script>}
```

### NPM

```sh
npm i -D @impulse.dev/runtime
```

```js
if (process.env.NODE_ENV === 'development') {
  import('@impulse.dev/runtime').then((impulse) => impulse.run())
}
```

IMPORTANT: make sure you are not shipping Impulse in your production build! It will bloat your bundle size!

Most bundlers cut out all the code inside an `if (process.env.NODE_ENV === 'development') { ... }`, but it's recommended to make a production build and compare the bundle size to what it was before.


## Setup

### Browser

If you are using Brave, enable File System Access API:
1. Go to brave://flags
2. Search for `file system access api`
3. Change it to "Enabled"

Impulse only works if you run your development environment on the same computer that you use the browser. Impulse doesn't work with remote environments because it can't edit files on other computers.

For security reasons, File System Access API only works for `localhost` when http:// is used. If you are using a different host name even though the environment is local, you should:
1. Go to chrome://flags
2. Search for `Insecure origins treated as secure`
3. Add the your origin (e.g. http://my_origin) to the list

### Prettier

Impulse edits your files and uses Prettier for formatting.

However, it can't get access to your Prettier config as it's a browser-only Node-less environment.

To fix it, you can pass it your config:

```diff
if (process.env.NODE_ENV === 'development') {
-  import('@impulse.dev/runtime').then((impulse) => impulse.run())
+  import('@impulse.dev/runtime').then((impulse) => impulse.run({
+    prettierConfig: require('path_to_prettier_config')
+  }))
}
```

Issues:

I change something and the selection goes away


## Use

A picture's worth a thousand words. A movie's worth a thousand pictures.

TODO embed video

IMPORANT: Impulse is alpha software. Although not likely, assume that it can unrecoverably ruin your codebase. Make sure to have a backup and/or a clean git state.

TODO text instruction after I fix the FS workflow


## Get help or share feedback

- [Discord server](https://discord.gg/RbVE8cj9)
- [Discussions on Github](https://github.com/kirillrogovoy/impulse/discussions)
- Tweet me at [@krogovoy](https://twitter.com/krogovoy) (DMs are open too)

## Contribute

Requirements:
- node 16+
- npm 8.9.0+

Clone the repo:
```sh
git clone git@github.com:kirillrogovoy/impulse.git && cd impulse
```

Install dependencies:
```sh
npm install
```

Run the dev server:
```sh
npm run dev
```

Open http://localhost:3005/. This is a playground for developing and testing the app.
