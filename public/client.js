
const canvas = document.getElementById('canvas')
const context = canvas.getContext('2d')
const deathDiv = document.getElementById('deathDiv')
const loginDiv = document.getElementById('loginDiv')
const joinButton = document.getElementById('joinButton')
const nameInput = document.getElementById('nameInput')
const scoreDiv = document.getElementById('scoreDiv')
const table1 = document.getElementById('table1')
const table2 = document.getElementById('table2')
const gameOverDiv = document.getElementById('gameOverDiv')
const victoryMessage = document.getElementById('victoryMessage')
const countdownMessage = document.getElementById('countdownMessage')
const socket = window.io()

const controls = [
  { key: 'w', input: 'up' },
  { key: 's', input: 'down' },
  { key: 'a', input: 'left' },
  { key: 'd', input: 'right' },
  { key: 'W', input: 'up' },
  { key: 'S', input: 'down' },
  { key: 'A', input: 'left' },
  { key: 'D', input: 'right' },
  { key: 'ArrowUp', input: 'up' },
  { key: 'ArrowDown', input: 'down' },
  { key: 'ArrowLeft', input: 'left' },
  { key: 'ArrowRight', input: 'right' },
  { key: 'Enter', input: 'select' },
  { key: ' ', input: 'select' }
]
const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  select: false
}
const state = {
  cores: [],
  walls: [],
  guards: [],
  updateTime: Date.now(),
  frameTime: Date.now(),
  lerp: 1,
  id: 'NO ID',
  safeTime: 4000,
  alive: true,
  respawn: false,
  joined: false,
  name: '',
  gameOver: false,
  countDown: 10,
  msg: {}
}
const camera = {
  x: 0,
  y: 0,
  zoom: -2.5,
  scale: 1
}

function updateCore (core) {
  if (!state.cores[core.id]) {
    state.cores[core.id] = core
    state.cores[core.id].ix = core.x
    state.cores[core.id].iy = core.y
  }
  state.cores[core.id].x = core.x
  state.cores[core.id].y = core.y
  state.cores[core.id].central = core.central
  state.cores[core.id].playerId = core.playerId
  if (state.alive && !state.gameOver) {
    state.cores[core.id].active = core.active
    state.cores[core.id].alive = core.alive
    state.cores[core.id].age = core.age
  }
}

function updateGuard (guard) {
  if (!state.guards[guard.id]) {
    state.guards[guard.id] = guard
    state.guards[guard.id].ix = guard.x
    state.guards[guard.id].iy = guard.y
  }
  state.guards[guard.id].x = guard.x
  state.guards[guard.id].y = guard.y
  state.guards[guard.id].playerId = guard.playerId
  if (state.alive && !state.gameOver) {
    state.guards[guard.id].active = guard.active
    state.guards[guard.id].alive = guard.alive
    state.guards[guard.id].age = guard.age
  }
}

function updateWall (wall) {
  if (!state.walls[wall.id]) {
    state.walls[wall.id] = wall
  }
  state.walls[wall.id].x = wall.x
  state.walls[wall.id].y = wall.y
}

socket.on('updateClient', msg => {
  state.updateTime = Date.now()
  state.msg = msg
  state.id = msg.id
  state.safeTime = msg.safeTime
  if (msg.joined) {
    deathDiv.style.display = 'block'
    gameOverDiv.style.display = 'block'
    scoreDiv.style.display = 'flex'
    scoreDiv.style.opacity = '1'
    loginDiv.style.display = 'none'
  } else {
    deathDiv.style.display = 'none'
    gameOverDiv.style.display = 'none'
    scoreDiv.style.display = 'none'
    scoreDiv.style.opacity = '1'
    loginDiv.style.display = 'block'
  }
  if (state.alive && !state.gameOver) {
    state.alive = msg.alive
    state.gameOver = msg.gameOver
    deathDiv.style.opacity = 0
    state.respawn = false
    msg.cores.forEach(core => updateCore(core))
    msg.guards.forEach(guard => updateGuard(guard))
    msg.walls.forEach(wall => updateWall(wall))
  } else {
    state.alive = msg.alive
    state.gameOver = msg.gameOver
    if (!state.alive) deathDiv.style.opacity = 1
  }
  if (state.gameOver) {
    const score1 = state.msg.scores[0]
    const score2 = state.msg.scores[1]
    if (msg.countdown > 0) {
      countdownMessage.innerText = `Next Game in ${msg.countdown}`
    }
    if (score1 > score2) {
      victoryMessage.style.color = 'DodgerBlue'
      victoryMessage.innerText = 'Blue Wins'
    }
    if (score2 > score1) {
      victoryMessage.style.color = 'LimeGreen'
      victoryMessage.innerText = 'Green Wins'
    }
    deathDiv.style.opacity = 0
    gameOverDiv.style.opacity = 1
  } else {
    gameOverDiv.style.opacity = 0
  }
  showScores(1)
  showScores(2)
  const reply = {
    input,
    id: state.id,
    respawn: state.respawn,
    name: state.name
  }
  socket.emit('updateServer', reply)
})

function interpolate (actor) {
  const dx = actor.x - actor.ix
  const dy = actor.y - actor.iy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 50) {
    actor.ix = state.lerp * actor.x + (1 - state.lerp) * actor.ix
    actor.iy = state.lerp * actor.y + (1 - state.lerp) * actor.iy
  } else {
    actor.ix = actor.x
    actor.iy = actor.y
  }
  if (actor.role === 'core' && actor.playerId === state.id) {
    camera.x = actor.ix
    camera.y = actor.iy
  }
}

function drawWall (wall) {
  context.fillStyle = 'Grey'
  context.beginPath()
  wall.vertices.forEach(v => context.lineTo(v.x - camera.x, v.y - camera.y))
  context.closePath()
  context.fill()
}

function drawCore (core) {
  if (core.active && core.alive) {
    context.lineCap = 'round'
    context.lineWidth = 4
    if (core.central && state.alive) {
      if (core.team === 1) context.strokeStyle = 'DodgerBlue'
      if (core.team === 2) context.strokeStyle = 'LimeGreen'
      context.beginPath()
      context.moveTo(core.ix - camera.x, core.iy - camera.y)
      context.lineTo(0 - camera.x, 0 - camera.y)
      context.stroke()
    }
    const guard = state.guards[core.guardId]
    if (core.team === 1) context.strokeStyle = 'DarkOrchid'
    if (core.team === 2) context.strokeStyle = 'Orange'
    context.beginPath()
    context.moveTo(guard.ix - camera.x, guard.iy - camera.y)
    context.lineTo(core.ix - camera.x, core.iy - camera.y)
    context.stroke()
    if (core.age < state.safeTime) {
      context.strokeStyle = 'White'
      context.lineWidth = 5
      context.beginPath()
      context.arc(core.ix - camera.x, core.iy - camera.y, core.radius, 0, 2 * Math.PI)
      context.stroke()
    }
    if (core.team === 1) context.fillStyle = 'Blue'
    if (core.team === 2) context.fillStyle = 'Green'
    context.beginPath()
    context.arc(core.ix - camera.x, core.iy - camera.y, core.radius, 0, 2 * Math.PI)
    context.fill()
  }
}

function drawGuard (guard) {
  if (guard.active && guard.alive) {
    if (guard.team === 1) context.fillStyle = 'DarkOrchid'
    if (guard.team === 2) context.fillStyle = 'Orange'
    context.beginPath()
    context.arc(guard.ix - camera.x, guard.iy - camera.y, guard.radius, 0, 2 * Math.PI)
    context.fill()
  }
}

function setupCamera () {
  camera.scale = Math.exp(camera.zoom)
  const xScale = camera.scale * canvas.width / 100
  const yScale = camera.scale * canvas.height / 100
  const xTranslate = canvas.width / 2
  const yTranslate = canvas.height / 2
  context.setTransform(yScale, 0, 0, xScale, xTranslate, yTranslate)
}

function drawArena () {
  context.strokeStyle = 'DimGrey'
  context.lineWidth = 2
  context.beginPath()
  context.arc(-camera.x, -camera.y, 400, 0, 2 * Math.PI)
  context.stroke()
  context.beginPath()
  context.arc(-camera.x, -camera.y, 900, 0, 2 * Math.PI)
  context.stroke()
  context.beginPath()
  context.moveTo(-camera.x + 1000, -camera.y)
  context.lineTo(-camera.x - 1000, -camera.y)
  context.stroke()
  context.beginPath()
  context.moveTo(-camera.x, -camera.y + 2000)
  context.lineTo(-camera.x, -camera.y - 2000)
  context.stroke()
}

function draw () {
  window.requestAnimationFrame(draw)
  state.lerp = Math.max(0, Math.min(1, (Date.now() - state.frameTime) / 40))
  state.frameTime = Date.now()
  setupCamera()
  const w = canvas.width / camera.scale * 100
  const h = canvas.height / camera.scale * 100
  context.clearRect(-w / 2, -h / 2, w, h)
  state.cores.forEach(core => interpolate(core))
  state.guards.forEach(guard => interpolate(guard))
  drawArena()
  state.cores.forEach(c => drawCore(c))
  state.guards.forEach(g => drawGuard(g))
  state.walls.forEach(r => drawWall(r))
}
draw()

function joinGame () {
  state.name = nameInput.value
  if (state.name !== '') {
    const msg = {}
    msg.id = state.id
    msg.name = state.name
    socket.emit('joinGame', msg)
  }
}

joinButton.onclick = joinGame
nameInput.onkeydown = function (e) { if (e.key === 'Enter') joinGame() }

window.onkeydown = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = true })
  if (input.select && !state.alive) state.respawn = true
}

window.onkeyup = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = false })
}

window.onwheel = function (e) {
  camera.zoom -= 0.001 * e.deltaY
}

function showScores (team) {
  const table = team === 1 ? table1 : table2
  const color = team === 1 ? 'DeepSkyBlue' : 'SpringGreen'
  const width = Math.max(0, window.innerWidth - window.innerHeight) / 4
  table.innerHTML = ''
  if (state.msg.players) {
    const players = state.msg.players.filter(player => {
      const active = player.connected && player.joined
      const scored = player.score > 0
      const onTeam = player.team === team
      return (active || scored) && onTeam
    })
    players.sort((a, b) => b.score - a.score)
    const tbody = document.createElement('tbody')
    players.forEach(player => {
      const row = document.createElement('tr')
      const cell1 = document.createElement('td')
      cell1.style.textAlign = 'center'
      cell1.style.border = '0vmin solid white'
      cell1.style.overflow = 'hidden'
      const text1 = document.createTextNode(player.name)
      cell1.appendChild(text1)
      const cell2 = document.createElement('td')
      cell2.style.textAlign = 'center'
      cell2.style.border = '0vmin solid white'
      cell2.style.overflow = 'hidden'
      const text2 = document.createTextNode(player.score)
      cell2.appendChild(text2)
      cell1.style.width = '1vmin'
      cell2.style.width = '1vmin'
      if (team === 1) {
        row.appendChild(cell1)
        row.appendChild(cell2)
      }
      if (team === 2) {
        row.appendChild(cell2)
        row.appendChild(cell1)
      }
      tbody.appendChild(row)
    })
    const row = document.createElement('tr')
    const cell1 = document.createElement('td')
    cell1.style.textAlign = 'center'
    cell1.style.border = '0vmin solid white'
    cell1.style.overflow = 'hidden'
    const text1 = document.createTextNode('TOTAL')
    cell1.appendChild(text1)
    const cell2 = document.createElement('td')
    cell2.style.textAlign = 'center'
    cell2.style.border = '0vmin solid white'
    cell2.style.overflow = 'hidden'
    cell1.style.width = '1vmin'
    cell2.style.width = '1vmin'
    const text2 = document.createTextNode(state.msg.scores[team - 1])
    cell2.appendChild(text2)
    if (team === 1) {
      row.appendChild(cell1)
      row.appendChild(cell2)
    }
    if (team === 2) {
      row.appendChild(cell2)
      row.appendChild(cell1)
    }
    tbody.appendChild(row)
    table.appendChild(tbody)
    table.style.color = color
    table.style.width = `${width}vmin`
    table.style.border = '0vmin solid white'
    table.style.borderSpacing = `${0.02 * width}vmin ${0.02 * width}vmin`
    table.style.fontSize = `${0.09 * width}vmin`
    table.style.tableLayout = 'fixed'
    table.style.opacity = 1
  }
}
