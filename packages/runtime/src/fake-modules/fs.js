export default {
  statSync: () => {
    return { mtimeMs: ++i }
  },
  readFileSync: (id) => self[id] || '',
}
