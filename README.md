# Impulse

[impulse.dev](https://impulse.dev) | [TODO Discord](/) | [TODO Twitter](/)

TODO: tag line

TODO: video link

Features:
TODO


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

Browsers:

- ✅ Chromium-based
- 🚫 Firefox
- 🚫 Safari

(Impulse relies on [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) which only works well in Chromium-based browsers)

Editor integration:
- ✅ VS Code
- more coming


## Install

### Try now

```js
d=document;s=d.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest';d.body.appendChild(s);s.onload=() => IMPULSE_RUN()
```

### <script> tag

TODO: simplify

```html
<script dangerouslySetInnerHTML={{__html: `d=document;s=d.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest';d.body.appendChild(s);s.onload=()=>IMPULSE_RUN()`}}></script>
```

### NPM

```sh
npm i -D @impulse.dev/runtime
```

```js
if (process.env.NODE_ENV === 'development') {
  import('@impulse.dev/runtime').then((mod) => mod.mountApp())
}
```


## Use

1. Brave: turn on fs access
2. if not localhost, add secure context

Must be same computer

Prettier support: pass config manually

Issues:

I change something and the selection goes away
