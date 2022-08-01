d = document
s = d.createElement('script')
s.src = `https://cdn.jsdelivr.net/npm/@impulse.dev/runtime@latest/dist/impulse.iife.js?${Date.now()}`
d.body.appendChild(s)
s.onload = () => IMPULSE_RUN()
