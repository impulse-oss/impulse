// const { VIRTUAL_SOURCE_PATH } = require('../constants')

let i = 0

export default {
  statSync: (id) => {
    // if (id === VIRTUAL_SOURCE_PATH) {
    //   return { mtimeMs: self.BUILD_ID }
    // }
    return { mtimeMs: ++i }
  },
  readFileSync: (id) => self[id] || '',
}
