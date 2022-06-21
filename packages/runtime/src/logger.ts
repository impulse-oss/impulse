export function trace(...messages: any) {
  // console.log('TRACE:', ...messages)
}

export function warn(...messages: any) {
  console.warn('<impulse.dev>', ...messages)
}

export function alert(message: string) {
  alert(message)
}
