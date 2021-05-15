require('segfault-handler').registerHandler('segfault.log')
const wrtc = require('wrtc')

const LOOP_TIME_MS = 40

let iteration = 0

function eventLoop() {
  console.log(`Iteration ${++iteration}`)

  const pc = new wrtc.RTCPeerConnection({})
  const dc = pc.createDataChannel('test', {})
  pc.createOffer({}).then(offer => pc.setLocalDescription(offer))

  setTimeout(eventLoop, LOOP_TIME_MS)
}

eventLoop()
