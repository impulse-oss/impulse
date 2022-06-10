# Impulse

## Install

### Try now

```js
d=document;s=d.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest';d.body.appendChild(s);s.onload=()=>IMPULSE_RUN()
```

### <script> tag

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
