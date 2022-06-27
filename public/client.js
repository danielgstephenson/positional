
const canvas = document.getElementById('canvas')
const context = canvas.getContext('2d')
const socket = window.io()

const controls = [
  { key: 'w', input: 'up' },
  { key: 's', input: 'down' },
  { key: 'a', input: 'left' },
  { key: 'd', input: 'right' },
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
  id: 'NO ID'
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
  state.cores[core.id].active = core.active
  state.cores[core.id].age = core.age
}

function updateGuard (guard) {
  if (!state.guards[guard.id]) {
    state.guards[guard.id] = guard
    state.guards[guard.id].ix = guard.x
    state.guards[guard.id].iy = guard.y
  }
  state.guards[guard.id].x = guard.x
  state.guards[guard.id].y = guard.y
  state.guards[guard.id].active = guard.active
  state.guards[guard.id].age = guard.age
}

function updateWall (wall) {
  if (!state.walls[wall.id]) {
    state.walls[wall.id] = wall
  }
  state.walls[wall.id].x = wall.x
  state.walls[wall.id].y = wall.y
}

window.onkeydown = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = true })
}

window.onkeyup = function (e) {
  controls.forEach(c => { if (e.key === c.key) input[c.input] = false })
}

window.onwheel = function (e) {
  camera.zoom -= 0.001 * e.deltaY
}

socket.on('updateClient', msg => {
  state.updateTime = Date.now()
  state.id = msg.id
  msg.cores.forEach(core => updateCore(core))
  msg.guards.forEach(guard => updateGuard(guard))
  msg.walls.forEach(wall => updateWall(wall))
  const reply = {
    input,
    id: state.id
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
  if (core.active) {
    context.lineWidth = 2
    if (core.team === 1) {
      context.fillStyle = 'Blue'
      context.strokeStyle = 'DarkOrchid'
    }
    if (core.team === 2) {
      context.fillStyle = 'Green'
      context.strokeStyle = 'Orange'
    }
    const guard = state.guards[core.guardId]
    context.beginPath()
    context.moveTo(guard.ix - camera.x, guard.iy - camera.y)
    context.lineTo(core.ix - camera.x, core.iy - camera.y)
    context.stroke()
    if (core.age < 3000) {
      context.strokeStyle = 'White'
      context.lineWidth = 5
      context.beginPath()
      context.arc(core.ix - camera.x, core.iy - camera.y, core.radius, 0, 2 * Math.PI)
      context.stroke()
    }
    context.beginPath()
    context.arc(core.ix - camera.x, core.iy - camera.y, core.radius, 0, 2 * Math.PI)
    context.fill()
  }
}

function drawGuard (guard) {
  if (guard.active) {
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
  const size = 1000
  context.beginPath()
  context.arc(-camera.x, -camera.y, size * 0.4, 0, 2 * Math.PI)
  context.stroke()
  context.beginPath()
  context.arc(-camera.x, -camera.y, size * 0.9, 0, 2 * Math.PI)
  context.stroke()
  context.beginPath()
  context.moveTo(-camera.x + size, -camera.y)
  context.lineTo(-camera.x - size, -camera.y)
  context.stroke()
  context.beginPath()
  context.moveTo(-camera.x, -camera.y + size)
  context.lineTo(-camera.x, -camera.y - size)
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
