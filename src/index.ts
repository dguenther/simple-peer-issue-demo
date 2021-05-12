require('segfault-handler').registerHandler('segfault.log')
const SimplePeer = require('simple-peer')
const wrtc = require('wrtc')

const LOOP_TIME_MS = 70

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let iteration = 0

const initiators = []
const recipients = []

async function eventLoop() {
  console.log(`Iteration ${++iteration}`)
  
  while (initiators.length > 20) {
    const conn = initiators.splice(getRandomInt(0, initiators.length - 1), 1)[0]
    conn.destroy()
  }
  
  while (recipients.length > 20) {
    const conn = recipients.splice(getRandomInt(0, initiators.length - 1), 1)[0]
    conn.destroy()
  }
  
  for (let i = 0; i < 4; i++) {
    const recip = new SimplePeer({ initiator: false, wrtc })
    const init = new SimplePeer({ initiator: true, wrtc })

    recip.on('signal', (signal) => {
      if (!init.destroyed) init.signal(signal)
    })
    init.on('signal', (signal) => {
      if (!recip.destroyed) recip.signal(signal)
    })
    
    initiators.push(init)
    recipients.push(recip)
  }
  
  setTimeout(eventLoop, LOOP_TIME_MS)
}

eventLoop()